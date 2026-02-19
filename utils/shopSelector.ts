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
} from "discord.js";
import { ChatInputCommandInteraction } from "discord.js";
import fs from "fs";
import {
  STORE_DESCRIPTION,
  STORE_NAME,
  ORDER_CATEGORY_ID,
  GUILD_ID,
  ORDER_HISTORY_CHANNEL_ID,
  SHOP_MANAGER_ROLE_ID,
} from "../config";
import { formatBalance } from "./formatBalance";
let shopData: any = null;
export function getShopCategories() {
  if (!shopData) {
    shopData = JSON.parse(fs.readFileSync("./db/shop.json", "utf-8"));
  }
  return shopData;
}

// Map to store the path for each item purchase transaction
const itemPurchasePath = new Map<string, { id: string; name: string }[]>();

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

  const action = await interaction.followUp({
    content: `Are you sure you want to buy **${item.name}**?`,
    embeds: [embed],
    components: [ActionButton],
  });
  const collector = action.createMessageComponentCollector({
    componentType: 2,
    time: 60000,
  });

  collector.on("collect", async (i) => {
    await i.deferUpdate();

    if (i.customId === "buy") {
      const transactionId = `ORD-${interaction.user.id}-${item.id}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      itemPurchasePath.set(transactionId, path);
      await createChannelOrder(interaction, item, transactionId);
      const embed = new EmbedBuilder()
        .setColor("#8F8F8F")
        .setTitle(`Order Created: ${item.name}`)
        .setDescription(
          `Your order has been created and is being processed by our shop managers. Please wait for updates in this DM or the order channel.\nTransaction ID: \`${transactionId}\``,
        )
        .addFields([
          { name: "Item", value: item.name, inline: true },
          { name: "Price", value: formatBalance(item.price), inline: true },
        ]);
      const qrPath = `./assets/img/qrcode.png`;
      const files = [];
      if (fs.existsSync(qrPath)) {
        embed.setImage(`attachment://qrcode.png`);
        files.push(qrPath);
      }
      await i.followUp({
        embeds: [embed],
        files: files,
        components: [],
      });
    } else if (i.customId === "cancel") {
      await i.followUp({
        content: `❌ Purchase cancelled for **${item.name}**`,
      });
    }
  });

  collector.on("end", async () => {
    await action.edit({ components: [] });
  });
}

async function createChannelOrder(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
) {
  const guild = interaction.client.guilds.cache.get(GUILD_ID);
  if (!guild)
    return interaction.followUp({
      content: "❌ Error: Guild not found. Please contact support.",
    });
  const category = guild.channels.cache.get(ORDER_CATEGORY_ID);
  if (!category) return;
  const shopManagerRole = guild.roles.cache.get(SHOP_MANAGER_ROLE_ID);
  if (!shopManagerRole)
    return await interaction.followUp({
      content: "❌ Error: Shop Manager role not found. Please contact support.",
    });
  const channelPermission = [
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
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ],
    },
  ];
  const channel = await guild.channels.create({
    name: `${transactionId}`,
    parent: ORDER_CATEGORY_ID,
    permissionOverwrites: channelPermission,
  });
  const confirmationOrder = await createOrderConfirmation(
    interaction,
    item,
    transactionId,
    channel,
    interaction.user,
  );

  return channel;
}

async function createOrderConfirmation(
  interaction: StringSelectMenuInteraction,
  item: any,
  transactionId: string,
  channel: TextChannel,
  user: User,
) {
  // for shop manager to confirm order
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
    content: `📢 New order received for **${item.name}**!`,
    embeds: [embed],
    components: [confirmButton],
  });
  const collector = reply.createMessageComponentCollector({
    componentType: 2,
    time: 60000,
  });

  collector.on("collect", async (i) => {
    await i.deferUpdate();

    if (i.customId === "confirm") {
      await user.send({
        content: `✅ Your order **${transactionId}** for **${item.name}** has been confirmed! Please wait for further updates from our shop managers in this DM.`,
        embeds: [await createReceipt(interaction, item, transactionId)],
      });
      //   remove components
      await reply.edit({
        content: `📢 New order received for **${item.name}**!`,
        embeds: [embed],
        components: [],
      });
      await channel.send({
        content: `✅ Order **${transactionId}** has been confirmed by <@${i.user.id}>.`,
      });
    } else if (i.customId === "reject") {
      await user.send({
        content: `❌ Your order **${transactionId}** for **${item.name}** has been rejected! Please wait for further updates from our shop managers in this DM.`,
      });
    } else if (i.customId === "refund") {
      await user.send({
        content: `💸 Order **${transactionId}** has been marked for refund. `,
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
  console.log;
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
