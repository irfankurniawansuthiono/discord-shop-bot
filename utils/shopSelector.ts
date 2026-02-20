import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
  StringSelectMenuInteraction,
  ComponentType,
  PermissionFlagsBits,
  TextChannel,
  User,
  type ModalActionRowComponentBuilder,
  TextInputStyle,
  TextInputBuilder,
  ModalBuilder,
  LabelBuilder,
  FileUploadBuilder,
  ButtonInteraction,
  type BufferResolvable,
  type APIAttachment,
  type JSONEncodable,
  Attachment,
  AttachmentBuilder,
  type AttachmentPayload,
} from "discord.js";
import { ChatInputCommandInteraction } from "discord.js";
import fs from "fs";
import {
  STORE_DESCRIPTION,
  STORE_NAME,
  ORDER_CATEGORY_ID,
  GUILD_ID,
  ORDER_HISTORY_SUCCESS_CHANNEL_ID,
  ORDER_HISTORY_FAILED_CHANNEL_ID,
  ORDER_HISTORY_REFUND_CHANNEL_ID,
  SHOP_MANAGER_ROLE_ID,
  PROCESSING_CATEGORY_ID,
  ORDER_REJECTION_CHANNEL_ID,
} from "../config";
import { formatBalance } from "./formatBalance";
import type Stream from "stream";
import { ManagerShopProtector } from "./protector";
let shopData: any = null;
export function getShopCategories() {
  if (!shopData) {
    shopData = JSON.parse(fs.readFileSync("./db/shop.json", "utf-8"));
  }
  return shopData;
}

// Map to store the path for each item purchase transaction
const itemPurchasePath = new Map<string, { id: string; name: string }[]>();
let uploadTimeout: NodeJS.Timeout | null = null;

export async function shopMenu(interaction: ChatInputCommandInteraction) {
  if (!shopData) getShopCategories();
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("shop-category-select")
    .setPlaceholder("Select a category")
    .addOptions(
      shopData.map((category: any) => ({
        label: category.name,
        value: category.id.toString(),
      })),
    );
  const row =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      selectMenu,
    );
  const embed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle(`🏪 ${STORE_NAME}`)
    .setDescription(STORE_DESCRIPTION);
  const reply = await interaction.reply({
    embeds: [embed],
    components: [row],
    withResponse: true,
  });
  const collector = reply.resource?.message?.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 60000,
  });

  if (!collector) return;
  collector.on("collect", async (i) => {
    await i.deferUpdate();
    const selectedCategoryId = i.values[0];
    const selectedCategoryItems = shopData.find(
      (cat: any) => cat.id.toString() === selectedCategoryId,
    );

    if (selectedCategoryId && selectedCategoryItems.items.length > 0) {
      await showMenu(i, selectedCategoryItems, [
        { id: selectedCategoryId.toString(), name: selectedCategoryItems.name },
      ]);
    } else {
      await i.followUp({
        content: `✅ You selected **${selectedCategoryItems.name}**\nPath:\n• ${selectedCategoryId}: ${selectedCategoryItems.name}`,
      });
    }
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await reply.resource?.message?.edit({
        content:
          "⏰ Time's up! Please use the command again to browse the shop.",
        embeds: [],
        components: [],
      });
    }
  });
}

async function showMenu(
  interaction: StringSelectMenuInteraction,
  node: any,
  path: { id: string; name: string }[],
) {
  const embed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle(`📂 ${node.name}`)
    .setDescription(node.description || "No description available.");

  if (!node.items || node.items.length === 0) {
    return await showItemDetails(interaction, node, path);
    // await interaction.followUp({
    //   content: `✅ You selected **${node.name}**\nPath:\n${path
    //     .map((p) => `• ${p.id}: ${p.name}`)
    //     .join("\n")}`,
    // });
  }

  const options = node.items.map((item: any) => ({
    label: item.name,
    value: item.id.toString(),
    description: item.description?.slice(0, 100),
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId("recursive-shop-menu")
    .setPlaceholder("Select an option")
    .addOptions(options);

  const row =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      menu,
    );

  const reply = await interaction.followUp({
    embeds: [embed],
    components: [row],
  });

  const collector = reply.createMessageComponentCollector({
    componentType: 3,
    time: 60000,
  });

  collector.on("collect", async (i) => {
    await i.deferUpdate();

    const selectedId = i.values[0];
    if (!selectedId) return;

    const selectedNode = node.items.find(
      (item: any) => item.id.toString() === selectedId,
    );

    await showMenu(i, selectedNode, [
      ...path,
      { id: selectedId.toString(), name: selectedNode.name },
    ]);
  });

  collector.on("end", async () => {
    await reply.edit({ components: [] });
  });
}

async function showItemDetails(
  interaction: StringSelectMenuInteraction,
  item: any,
  path: { id: string; name: string }[],
) {
  const embed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle(`🛒 ${item.name}`)
    .setDescription(item.description || "No description available.");
  // buttopn
  const ActionButton =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("buy")
        .setLabel("Buy Now")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✔️"),
      new ButtonBuilder()
        .setCustomId("cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("✖️"),
    );

  const reply = await interaction.followUp({
    content: `Are you sure you want to buy **${item.name}**?`,
    embeds: [embed],
    components: [ActionButton],
  });
  const collector = reply.createMessageComponentCollector({
    componentType: 2,
    time: 60000,
  });
  collector.on("collect", async (i) => {
    if (i.customId === "buy") {
      await i.update({
        content: `Are you sure you want to buy **${item.name}**?`,
        embeds: [embed],
        components: [],
      });
      const transactionId = `${interaction.user.id}-${item.id}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      itemPurchasePath.set(transactionId, path);
      const channel = await createChannelOrder(
        interaction,
        item,
        transactionId,
      );
      const embedOrderCreated = new EmbedBuilder()
        .setColor("#8F8F8F")
        .setTitle(`Order Created: ${item.name}`)
        .setDescription(
          `Your order has been created, please upload the proof of payment below.\nTransaction ID: \`${transactionId}\``,
        )
        .addFields([
          { name: "Item", value: item.name, inline: true },
          { name: "Price", value: formatBalance(item.price), inline: true },
        ]);
      const qrPath = `./assets/img/qrcode.png`;
      const files = [];
      if (fs.existsSync(qrPath)) {
        files.push(qrPath);
        embedOrderCreated.setImage(`attachment://qrcode.png`);
      }
      await i.followUp({
        embeds: [embedOrderCreated],
        files: files,
        components: [],
      });
      await createPaymentProof(interaction, transactionId, item, channel);
    } else if (i.customId === "cancel") {
      await i.update({
        content: `❌ Purchase cancelled for **${item.name}**`,
        embeds: [],
        components: [],
      });
    }
  });

  collector.on("end", async () => {
    await reply.edit({ components: [] });
  });
}
async function createPaymentProof(
  interaction: StringSelectMenuInteraction,
  transactionId: string,
  item: any,
  channel: TextChannel,
) {
  const uploadPaymentProofModal = new ModalBuilder()
    .setCustomId(`upload-proof-${transactionId}`)
    .setTitle("Upload Payment Proof");
  const paymentProofInput = new FileUploadBuilder()
    .setCustomId(`payment-proof-${transactionId}`)
    .setRequired(true)
    .setMinValues(1)
    .setMaxValues(1);
  const paymentProofLabel = new LabelBuilder()
    .setLabel("Payment Proof (Image Only)")
    .setFileUploadComponent(paymentProofInput);
  uploadPaymentProofModal.addLabelComponents(paymentProofLabel);

  const embed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle(`🛒 ${item.name}`)
    .setDescription(item.description || "No description available.");

  const actionRow =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`upload-proof-btn-${transactionId}`)
        .setLabel("Upload Payment Proof")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("⬆️"),
      new ButtonBuilder()
        .setCustomId(`cancel-upload-btn-${transactionId}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("✖️"),
    );

  const reply = await interaction.followUp({
    content: `Please upload your payment proof for **${item.name}** in the modal that just opened. This will help our shop managers verify your purchase and process your order faster.\nTransaction ID: \`${transactionId}\``,
    embeds: [embed],
    components: [actionRow],
  });
  uploadTimeout = setTimeout(
    async () => {
      try {
        await reply.edit({
          content: `⏰ Transaction **${transactionId}** cancelled because no payment proof was uploaded within 5 minutes.\nPlease place your order again if you still wish to purchase **${item.name}**.`,
          embeds: [],
          components: [],
        });
        await sendFailedOrderNotification(
          interaction,
          item,
          transactionId,
          "Transaction cancelled because no payment proof was uploaded within 5 minutes",
        );
        // Update database status -> cancelled
        itemPurchasePath.delete(transactionId);
        channel.delete().catch((err) => {
          console.error("Failed to delete order channel:", err);
        });
      } catch (err) {
        console.error("Failed to auto-cancel transaction:", err);
      }

      if (uploadTimeout) clearTimeout(uploadTimeout);
    },
    5 * 60 * 1000,
  );
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
  });
  if (!collector) return;

  collector.on("collect", async (i) => {
    if (i.customId === `upload-proof-btn-${transactionId}`) {
      await i.showModal(uploadPaymentProofModal);
      // get modal submit
      const submittedPaymentProof = await i.awaitModalSubmit({
        time: 5 * 60 * 1000,
      });
      if (!submittedPaymentProof) {
        await i.followUp({
          content: `⏰ Transaction **${transactionId}** cancelled because no payment proof was submitted within 5 minutes.\nPlease place your order again if you still wish to purchase **${item.name}**.`,
          embeds: [],
          components: [],
        });
        await sendFailedOrderNotification(
          interaction,
          item,
          transactionId,
          "Transaction cancelled because no payment proof was submitted within 5 minutes",
        );
        return;
      }
      const paymentProof = submittedPaymentProof.fields.getUploadedFiles(
        `payment-proof-${transactionId}`,
      );
      if (!paymentProof) {
        await submittedPaymentProof.followUp({
          content: `❌ No payment proof uploaded. Please try again.`,
          embeds: [],
          components: [],
        });
        return;
      }
      await submittedPaymentProof.deferUpdate();
      const filesArray: (
        | BufferResolvable
        | Stream
        | JSONEncodable<APIAttachment>
        | Attachment
        | AttachmentBuilder
        | AttachmentPayload
      )[] = Array.from(paymentProof.values());

      if (filesArray.length > 0) {
        const proofDir = "./db/paymentProof";

        if (!fs.existsSync(proofDir)) {
          fs.mkdirSync(proofDir, { recursive: true });
        }

        const file = filesArray[0] as Attachment;

        const response = await fetch(file.url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const extension = file.name?.split(".").pop() ?? "png";
        const proofPath = `${proofDir}/${transactionId}.${extension}`;

        fs.writeFileSync(proofPath, buffer);

        await submittedPaymentProof.editReply({
          content: `✅ Payment proof received for **${item.name}**. Awaiting review from shop managers...`,
          embeds: [],
          components: [],
        });
        await channel.send({
          content: `📢 Payment proof uploaded for **${item.name}** by <@${i.user.id}>. Please review the attachment and confirm the order in this channel.`,
          files: filesArray,
        });
        // clear timeout
        if (uploadTimeout) clearTimeout(uploadTimeout);
      }
    } else if (i.customId === `cancel-upload-btn-${transactionId}`) {
      if (uploadTimeout) clearTimeout(uploadTimeout);

      await i.update({
        content: `❌ Payment proof upload cancelled for **${item.name}**`,
        components: [],
        embeds: [],
      });
      const guild = interaction.client.guilds.cache.get(GUILD_ID);
      if (!guild) {
        throw new Error("Guild not found");
      }

      // Update database status -> cancelled
      await sendFailedOrderNotification(
        interaction,
        item,
        transactionId,
        "Payment proof upload cancelled by user",
      );
      itemPurchasePath.delete(transactionId);
      channel.delete().catch((err) => {
        console.error("Failed to delete order channel:", err);
      });
    }
  });
}
async function createChannelOrder(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
): Promise<TextChannel> {
  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    interaction.followUp({
      content: `❌ Error: Guild not found. Please contact the shop manager for assistance.`,
    });
    throw new Error("Guild not found");
  }

  const category = guild.channels.cache.get(ORDER_CATEGORY_ID);
  if (!category) {
    interaction.followUp({
      content: `❌ Error: Order category not found. Please contact the shop manager for assistance.`,
    });
    throw new Error("Category not found");
  }

  const shopManagerRole = guild.roles.cache.get(SHOP_MANAGER_ROLE_ID);
  if (!shopManagerRole) {
    interaction.followUp({
      content: `❌ Error: Shop manager role not found. Please contact the shop manager for assistance.`,
    });
    throw new Error("Shop manager role not found");
  }

  const channel = await guild.channels.create({
    name: `ord-${transactionId}`,
    parent: ORDER_CATEGORY_ID,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: shopManagerRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: interaction.client.user!.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
  });

  if (!channel.isTextBased()) {
    throw new Error("Created channel is not a text channel");
  }

  await createOrderConfirmation(
    interaction,
    item,
    transactionId,
    channel,
    interaction.user,
  );

  return channel as TextChannel;
}

async function createOrderConfirmation(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
  channel: TextChannel,
  user: User,
) {
  const embed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle(`New Order: ${item.name}`)
    .setDescription(
      `A new order has been created for **${item.name}**. Please confirm the order by clicking the button below.\nTransaction ID: \`${transactionId}\``,
    )
    .addFields([
      { name: "Item", value: item.name, inline: true },
      { name: "Price", value: formatBalance(item.price), inline: true },
      { name: "Customer", value: `<@${interaction.user.id}>`, inline: true },
      { name: "DiscordID", value: interaction.user.id, inline: true },
      {
        name: "Order Path",
        value:
          itemPurchasePath
            .get(transactionId)
            ?.map((node) => node.name)
            .join(" > ") || "Unknown",
        inline: false,
      },
    ]);
  const confirmButton =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm")
        .setLabel("Confirm")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✔️"),
      new ButtonBuilder()
        .setCustomId("reject")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("✖️"),
      new ButtonBuilder()
        .setCustomId("refund")
        .setLabel("Refund")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("↩️"),
    );
  const reply = await channel.send({
    content: `<@&${SHOP_MANAGER_ROLE_ID}>\n📢 New order received for **${item.name}**!`,
    embeds: [embed],
    components: [confirmButton],
  });
  const collector = reply.createMessageComponentCollector({
    componentType: 2,
    time: 60000,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "confirm") {
      // protector
      const protectorResult = await ManagerShopProtector(i);
      if (!protectorResult) return;
      await user.send({
        content: `✅ Your order **${transactionId}** for **${item.name}** has been confirmed! Please wait for further updates from our shop managers in this DM.`,
        embeds: [await createReceipt(interaction, item, transactionId)],
      });
      if (!protectorResult) return;
      await reply.edit({
        content: `📢 New order received for **${item.name}**!`,
        embeds: [embed],
        components: [],
      });
      await channel.setName(`prc-${transactionId}`);
      const processingCategory = channel.guild.channels.cache.get(
        PROCESSING_CATEGORY_ID,
      );
      if (processingCategory) {
        await channel.setParent(PROCESSING_CATEGORY_ID, {
          lockPermissions: false,
        });
      }
      const completeButton =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`complete-${transactionId}`)
            .setLabel("Mark as Completed")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✔️"),
        );
      await channel.send({
        content: `✅ Order **${transactionId}** has been confirmed by <@${i.user.id}>.`,
        embeds: [],
        components: [completeButton],
      });
      const completeCollector = channel.createMessageComponentCollector({
        componentType: 2,
        time: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      completeCollector.on("collect", async (i) => {
        if (i.customId === `complete-${transactionId}`) {
          const protectorResult = await ManagerShopProtector(i);
          if (!protectorResult) return;
          await channel.delete().catch((err) => {
            console.error("Failed to delete order channel:", err);
          });
          await user.send({
            content: `🎉 Your order **${transactionId}** for **${item.name}** has been marked as completed by ${i.user}! Thank you for shopping with us!`,
          });
          return await sendSuccessOrderNotification(
            interaction,
            item,
            transactionId,
          );
        }
      });

      await user.send({
        content: `✅ Order **${transactionId}** has been confirmed by <@${i.user.id}>.`,
      });
    } else if (i.customId === "reject") {
      const protectorResult = await ManagerShopProtector(i);
      if (!protectorResult) return;
      const rejectModal = new ModalBuilder()
        .setCustomId(`reject-${transactionId}`)
        .setTitle("Reject Order");
      const reasonInput = new TextInputBuilder()
        .setCustomId(`reject-reason-${transactionId}`)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder("Please provide a reason for rejecting this order");
      const reasonLabel = new LabelBuilder()
        .setLabel("Reason for rejection")
        .setTextInputComponent(reasonInput);

      rejectModal.addLabelComponents(reasonLabel);
      await i.showModal(rejectModal);

      const submittedRejectReason = await i.awaitModalSubmit({
        time: 7 * 24 * 60 * 1000,
      });
      if (!submittedRejectReason) {
        await i.followUp({
          content: `⏰ No rejection reason submitted. Please try again.`,
          embeds: [],
          components: [],
        });
        return;
      }
      const reason = submittedRejectReason.fields.getTextInputValue(
        `reject-reason-${transactionId}`,
      );
      await submittedRejectReason.deferUpdate();
      // embed
      const rejectedPath = `./assets/img/rejected.png`;
      const files = [];

      const rejectionEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle(`❌ Order Rejected: ${item.name}`)
        .setDescription(
          `Order **${transactionId}** for **${item.name}** has been rejected by <@${i.user.id}>.\nReason: ${reason}`,
        )
        .addFields([
          { name: "Item", value: item.name, inline: true },
          { name: "Price", value: formatBalance(item.price), inline: true },
          {
            name: "Customer",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
          { name: "DiscordID", value: interaction.user.id, inline: true },
        ])
        .setTimestamp();
      if (fs.existsSync(rejectedPath)) {
        files.push(rejectedPath);
        rejectionEmbed.setThumbnail(`attachment://rejected.png`);
      }

      await sendRejectionOrderNotification(
        interaction,
        item,
        transactionId,
        reason,
      );
      await user.send({
        content: `❌ Your order has been rejected\nPlease make a ticket if you think this is a mistake.`,
        embeds: [rejectionEmbed],
        files: files,
      });

      await channel.delete().catch((err) => {
        console.error("Failed to delete order channel:", err);
      });
    } else if (i.customId === "refund") {
      const protectorResult = await ManagerShopProtector(i);
      if (!protectorResult) return;
      await user.send({
        content: `💸 Order **${transactionId}** has been marked for refund.`,
      });
    }
  });
}

async function createReceipt(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
) {
  const currentDate = new Date();
  const receiptEmbed = new EmbedBuilder()
    .setColor("#00ff00")
    .setTitle("🧾 Purchase Receipt")
    .setDescription("Thank you for your purchase!")
    .setFields([
      {
        name: "Transaction Details",
        value: `ID: \`${transactionId}\`\nDate: \`${currentDate.toLocaleString()}\``,
      },
      {
        name: "Store Information",
        value: `Name: ${STORE_NAME}\nDescription: ${STORE_DESCRIPTION}`,
      },
      {
        name: "Item Purchased",
        value: `Name: ${item.name}\nPrice: ${formatBalance(item.price)}`,
      },
      {
        name: "Item Location in Shop",
        value:
          itemPurchasePath
            .get(transactionId)
            ?.map((node) => node.name)
            .join(" > ") || "Unknown",
      },
      {
        name: "Customer Information",
        value: `Username: ${interaction.user.username}\nDiscordID: ${interaction.user.id}`,
      },
      {
        name: "Purchase Summary",
        value: [
          "```",
          "Item Price:     " + formatBalance(item.price),
          "─────────────────────────",
          "Total Paid:     " + formatBalance(item.price),
          "```",
        ].join("\n"),
      },
    ])
    .setFooter({
      text: `Transaction ID: ${transactionId} • Keep this receipt for your records`,
    })
    .setTimestamp();

  return receiptEmbed;
}

async function sendFailedOrderNotification(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
  reason: string,
) {
  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    throw new Error("Guild not found");
  }
  const channel = guild.channels.cache.get(ORDER_HISTORY_FAILED_CHANNEL_ID);
  if (!channel) {
    throw new Error("Order history channel not found");
  }
  if (!channel.isTextBased()) {
    throw new Error("Order history channel is not a text channel");
  }

  const embed = new EmbedBuilder()
    .setColor("#ff0000")
    .setTitle(`❌ Transaction Failed: ${item.name}`)
    .setDescription(
      `An order transaction has failed for **${item.name}**. Please review the details below and take necessary actions.\nTransaction ID: \`${transactionId}\`\nReason: ${reason}`,
    )
    .addFields(
      { name: "Item", value: item.name, inline: true },
      { name: "Price", value: formatBalance(item.price), inline: true },
      { name: "Customer", value: `<@${interaction.user.id}>`, inline: true },
      { name: "DiscordID", value: interaction.user.id, inline: true },
      {
        name: "Item Location in Shop",
        value:
          itemPurchasePath
            .get(transactionId)
            ?.map((node) => node.name)
            .join(" > ") || "Unknown",
        inline: false,
      },
    )
    .setTimestamp();
  const cancelImagePath = `./assets/img/cancelled.webp`;
  const files = [];
  if (fs.existsSync(cancelImagePath)) {
    embed.setThumbnail(`attachment://cancelled.webp`);
    files.push(cancelImagePath);
  }
  await channel.send({
    embeds: [embed],
    files: files,
  });
}

async function sendSuccessOrderNotification(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
) {
  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    throw new Error("Guild not found");
  }
  const channel = guild.channels.cache.get(ORDER_HISTORY_SUCCESS_CHANNEL_ID);
  if (!channel) {
    throw new Error("Order history channel not found");
  }
  if (!channel.isTextBased()) {
    throw new Error("Order history channel is not a text channel");
  }
  const embed = await createReceipt(interaction, item, transactionId);
  await channel.send({
    content: `✅ Transaction Success! Marked as completed by <@${interaction.user.id}>`,
    embeds: [embed],
  });
}

async function sendRejectionOrderNotification(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
  reason: string,
) {
  const rejectedPath = `./assets/img/rejected.png`;
  const files = [];

  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild) {
    throw new Error("Guild not found");
  }
  const channel = guild.channels.cache.get(ORDER_REJECTION_CHANNEL_ID);
  if (!channel) {
    throw new Error("Order rejection channel not found");
  }
  if (!channel.isTextBased()) {
    throw new Error("Order rejection channel is not a text channel");
  }
  const embed = new EmbedBuilder()
    .setColor("#ff0000")
    .setTitle(`❌ Order Rejected: ${item.name}`)
    .setDescription(
      `An order has been rejected for **${item.name}**. Please review the details below and take necessary actions.\nTransaction ID: \`${transactionId}\`\nReason: ${reason}`,
    )
    .addFields(
      { name: "Item", value: item.name, inline: true },
      { name: "Price", value: formatBalance(item.price), inline: true },
      { name: "Customer", value: `<@${interaction.user.id}>`, inline: true },
      { name: "DiscordID", value: interaction.user.id, inline: true },
      {
        name: "Rejected by :",
        value: `<@${interaction.user.id}>`,
        inline: true,
      },
      {
        name: "Item Location in Shop",
        value:
          itemPurchasePath
            .get(transactionId)
            ?.map((node) => node.name)
            .join(" > ") || "Unknown",
        inline: false,
      },
    )
    .setTimestamp();
  if (fs.existsSync(rejectedPath)) {
    embed.setThumbnail(`attachment://rejected.png`);
    files.push(rejectedPath);
  }
  await channel.send({ embeds: [embed], files: files });
}
