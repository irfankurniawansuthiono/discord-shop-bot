import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  type APIAttachment,
  type Attachment,
  type AttachmentBuilder,
  type AttachmentPayload,
  type BufferResolvable,
  type JSONEncodable,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
  type TextChannel,
} from "discord.js";
import { GUILD_ID } from "../../config";
import { itemPurchasePath } from "../shop";
import { ShopNotifications } from "./shopNotification";
import type Stream from "stream";
import fs from "fs";
import { saveImage, type FilesArrayType } from "../saveImage";
export interface Payment {
  uploadTimeout: NodeJS.Timeout | null;
}
export class Payment {
  constructor() {
    this.uploadTimeout = null;
  }
  async createPaymentProof(
    interaction: StringSelectMenuInteraction,
    transactionId: string,
    item: any,
    channel: TextChannel,
  ) {
    try {
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
        withResponse: true,
      });
      const messageId = reply.id;
      const userId = interaction.user.id;
      this.uploadTimeout = setTimeout(
        async () => {
          try {
            // Cancel transaction and notify user
            const user = await interaction.client.users.fetch(userId);
            const dmChannel = await user.createDM();

            const message = await dmChannel.messages.fetch(messageId);
            if (!message) return;

            await message.edit({
              content: `⏰ Transaction **${transactionId}** cancelled because no payment proof was uploaded within 5 minutes.\nPlease place your order again if you still wish to purchase **${item.name}**.`,
              embeds: [],
              components: [],
            });
            await ShopNotifications.sendFailedOrderNotification(
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

          if (this.uploadTimeout) clearTimeout(this.uploadTimeout);
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
            await ShopNotifications.sendFailedOrderNotification(
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
          const filesArray: FilesArrayType = Array.from(paymentProof.values());

          if (filesArray.length > 0) {
            const proofDir = "./db/paymentProof";

            if (!fs.existsSync(proofDir)) {
              fs.mkdirSync(proofDir, { recursive: true });
            }
            await saveImage(filesArray, transactionId, proofDir);

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
            if (this.uploadTimeout) clearTimeout(this.uploadTimeout);
          }
        } else if (i.customId === `cancel-upload-btn-${transactionId}`) {
          if (this.uploadTimeout) clearTimeout(this.uploadTimeout);

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
          await ShopNotifications.sendFailedOrderNotification(
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
    } catch (error) {
      console.error("Error in createPaymentProof:", error);
      await interaction.followUp({
        content: `❌ An error occurred while uploading the payment proof. Please try again later.`,
      });
    }
  }
}
