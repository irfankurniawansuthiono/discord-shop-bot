import {
  EmbedBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  GUILD_ID,
  ORDER_HISTORY_FAILED_CHANNEL_ID,
  ORDER_HISTORY_SUCCESS_CHANNEL_ID,
  ORDER_REJECTION_CHANNEL_ID,
} from "../../config";
import fs from "fs";
import { itemPurchasePath } from "../shop";
import { formatBalance } from "../formatBalance";
import { Receipt } from "./receipt";

export class ShopNotifications {
  static async sendFailedOrderNotification(
    interaction: StringSelectMenuInteraction,
    item: any,
    transactionId: string,
    reason: string,
  ) {
    try {
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
          {
            name: "Customer",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
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
    } catch (error) {
      console.error("Error in sendFailedOrderNotification:", error);
      return new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("Error Generating Receipt")
        .setDescription(
          "An error occurred while generating the receipt. Please contact support for assistance.",
        );
    }
  }

  static async sendSuccessOrderNotification(
    interaction: StringSelectMenuInteraction | ButtonInteraction,
    item: any,
    transactionId: string,
  ) {
    try {
      const guild = interaction.client.guilds.cache.get(GUILD_ID);
      if (!guild) {
        throw new Error("Guild not found");
      }
      const channel = guild.channels.cache.get(
        ORDER_HISTORY_SUCCESS_CHANNEL_ID,
      );
      if (!channel) {
        throw new Error("Order history channel not found");
      }
      if (!channel.isTextBased()) {
        throw new Error("Order history channel is not a text channel");
      }
      const embed = await Receipt.createReceipt(
        interaction,
        item,
        transactionId,
      );
      await channel.send({
        content: `✅ Transaction Success! Marked as completed by <@${interaction.user.id}>\nMarked By DiscordID: ${interaction.user.id}\nTransaction ID: \`${transactionId}\``,
        embeds: [embed],
      });
    } catch (error) {
      console.error("Error in sendSuccessOrderNotification:", error);
      await interaction.followUp({
        content: `❌ An error occurred while sending the success notification. Please try again later.`,
      });
    }
  }

  static async sendRejectionOrderNotification(
    interaction: StringSelectMenuInteraction,
    item: any,
    transactionId: string,
    reason: string,
  ) {
    try {
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
          {
            name: "Customer",
            value: `<@${interaction.user.id}>`,
            inline: true,
          },
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
    } catch (error) {
      console.error("Error in sendRejectionOrderNotification:", error);
      await interaction.followUp({
        content: `❌ An error occurred while sending the rejection notification. Please try again later.`,
      });
    }
  }
}
