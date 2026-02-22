import {
  ActionRowBuilder,
  Attachment,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  User,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
  type TextChannel,
} from "discord.js";
import {
  GUILD_ID,
  ORDER_CATEGORY_ID,
  PROCESSING_CATEGORY_ID,
  SHOP_MANAGER_ROLE_ID,
} from "../../config";
import { formatBalance } from "../formatBalance";
import { itemPurchasePath } from "../shop";
import { Receipt } from "./receipt";
import { ShopNotifications } from "./shopNotification";
import fs from "fs";
import { Protector } from "../protector";
import { saveImage, type FilesArrayType } from "../saveImage";
import { MessageEmbedBuilder } from "./embedBuilder";
export class Order {
  static async createChannelOrder(
    interaction: StringSelectMenuInteraction,
    item: any,
    transactionId: string,
  ): Promise<TextChannel | null> {
    try {
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

      await this.createOrderConfirmation(
        interaction,
        item,
        transactionId,
        channel,
        interaction.user,
      );

      return channel as TextChannel;
    } catch (error) {
      console.error("Error in createChannelOrder:", error);
      interaction.followUp({
        content: `❌ An error occurred while creating the order channel. Please try again later.`,
      });
      return null;
    }
  }

  static async createOrderConfirmation(
    interaction: StringSelectMenuInteraction,
    item: any,
    transactionId: string,
    channel: TextChannel,
    user: User,
  ) {
    try {
      const embed = new EmbedBuilder()
        .setColor("#00ff00")
        .setTitle(`New Order: ${item.name}`)
        .setDescription(
          `A new order has been created for **${item.name}**. Please confirm the order by clicking the button below.\nTransaction ID: \`${transactionId}\``,
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
      });

      collector.on("collect", async (i) => {
        if (i.customId === "confirm") {
          // protector
          const protectorResult = await Protector.ManagerShopProtector(i);
          if (!protectorResult) return;
          await user.send({
            content: `✅ Your order **${transactionId}** for **${item.name}** has been confirmed! Please wait for further updates from our shop managers in this DM.`,
            embeds: [
              await Receipt.createReceipt(interaction, item, transactionId),
            ],
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
              const protectorResult = await Protector.ManagerShopProtector(i);
              if (!protectorResult) return;
              await channel.delete().catch((err) => {
                console.error("Failed to delete order channel:", err);
              });
              // create marks as completed message
              const markCompletedMessage = new EmbedBuilder()
                .setColor("#00ff00")
                .setTitle(`🎉 Order Completed: ${item.name}`)
                .setDescription(
                  `Order **${transactionId}** for **${item.name}** has been marked as completed by ${i.user}!`,
                )
                .addFields([
                  { name: "Item", value: item.name, inline: true },
                  {
                    name: "Price",
                    value: formatBalance(item.price),
                    inline: true,
                  },
                  {
                    name: "Customer",
                    value: `<@${interaction.user.id}>`,
                    inline: true,
                  },
                  {
                    name: "Customer DiscordID",
                    value: interaction.user.id,
                    inline: true,
                  },
                  { name: "Marked By", value: `<@${i.user.id}>`, inline: true },
                  {
                    name: "Marked By DiscordID",
                    value: i.user.id,
                    inline: true,
                  },
                ]);
              await user.send({
                embeds: [markCompletedMessage],
              });
              return await ShopNotifications.sendSuccessOrderNotification(
                i,
                item,
                transactionId,
              );
            }
          });

          await user.send({
            content: `✅ Order **${transactionId}** has been confirmed by <@${i.user.id}>.`,
          });
        } else if (i.customId === "reject") {
          const protectorResult = await Protector.ManagerShopProtector(i);
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

          const rejectionMessageUser = await MessageEmbedBuilder.rejection(
            i,
            interaction,
            item,
            transactionId,
            reason,
            "❌ Your order has been rejected\nPlease make a ticket if you think this is a mistake.",
          );
          const rejectionMessageChannel = await MessageEmbedBuilder.rejection(
            i,
            interaction,
            item,
            transactionId,
            reason,
            `Order **${transactionId}** for **${item.name}** has been rejected by <@${i.user.id}>.`,
          );
          if (fs.existsSync(rejectedPath)) {
            files.push(rejectedPath);
          }

          await ShopNotifications.sendRejectionOrderNotification(
            interaction,
            rejectionMessageChannel,
          );
          await user.send(rejectionMessageUser);

          await channel.delete().catch((err) => {
            console.error("Failed to delete order channel:", err);
          });
        } else if (i.customId === "refund") {
          const protectorResult = await Protector.ManagerShopProtector(i);
          if (!protectorResult) return;
          const uploadRefundProofModal = new ModalBuilder()
            .setCustomId(`upload-proof-${transactionId}`)
            .setTitle("Upload refund Proof");
          const refundProofInput = new FileUploadBuilder()
            .setCustomId(`refund-proof-${transactionId}`)
            .setRequired(true)
            .setMinValues(1)
            .setMaxValues(1);
          const refundProofLabel = new LabelBuilder()
            .setLabel("Payment Proof (Image Only)")
            .setFileUploadComponent(refundProofInput);

          // reason reffund
          const refundReasonInput = new TextInputBuilder()
            .setCustomId(`refund-reason-${transactionId}`)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder("Please provide a reason for refunding this order");
          const refundReasonLabel = new LabelBuilder()
            .setLabel("Reason for refund")
            .setTextInputComponent(refundReasonInput);
          uploadRefundProofModal.addLabelComponents([
            refundReasonLabel,
            refundProofLabel,
          ]);
          await i.showModal(uploadRefundProofModal);

          const submittedRefundProof = await i.awaitModalSubmit({
            time: 7 * 24 * 60 * 1000,
          });
          const refundButton = new ButtonBuilder()
            .setCustomId("refund")
            .setLabel("Refund")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("↩️");
          const actionRefButton =
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
              refundButton,
            );
          if (!submittedRefundProof) {
            await i.followUp({
              content: `⏰ No refund proof submitted. Please try again.`,
              embeds: [],
              components: [actionRefButton],
            });
            return;
          }
          await submittedRefundProof.deferUpdate();
          const refundPath = "./db/refundProof";
          if (!fs.existsSync(refundPath)) {
            fs.mkdirSync(refundPath, { recursive: true });
          }
          const refundProof = submittedRefundProof.fields.getUploadedFiles(
            `refund-proof-${transactionId}`,
          );
          if (!refundProof) {
            await submittedRefundProof.editReply({
              content: `❌ No refund proof found in the submission. Please try again.`,
              embeds: [],
              components: [actionRefButton],
            });
            return;
          }
          const filesArray: FilesArrayType = Array.from(refundProof.values());
          const refundReason = submittedRefundProof.fields.getTextInputValue(
            `refund-reason-${transactionId}`,
          );
          const refundImage = filesArray[0] as Attachment;

          if (filesArray.length > 0) {
            await saveImage(filesArray, transactionId, refundPath);
            channel.delete().catch((err) => {
              console.error("Failed to delete order channel:", err);
            });
            const refundStampPath = "./assets/img/refund.png";
            const refundEmbed = await MessageEmbedBuilder.refund(
              i,
              interaction,
              item,
              transactionId,
              refundReason,
              refundImage.url,
            );
            const messageToSend = {
              content: `💸 Order **${transactionId}** has been marked as a refund by <@${i.user.id}>`,
              embeds: [refundEmbed],
              files: [{ attachment: refundStampPath, name: "refund.png" }],
            };
            await user.send(messageToSend);
            await ShopNotifications.sendRefundNotification(i, messageToSend);
          }
        }
      });
    } catch (error) {
      console.error("Error in createOrderConfirmation:", error);
      await channel.send({
        content: `❌ An error occurred while creating the order confirmation. Please try again later.`,
      });
    }
  }
}
