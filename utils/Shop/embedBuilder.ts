import {
  EmbedBuilder,
  ModalSubmitInteraction,
  User,
  type ButtonInteraction,
  type Interaction,
} from "discord.js";
import { formatBalance } from "../formatBalance";
import { itemPurchasePath } from "../shop";
import fs from "fs";
export class MessageEmbedBuilder {
  static async refund(
    i: Interaction,
    interaction: Interaction,
    item: any,
    transactionId: string,
    refundReason: string,
    refundProof: string,
  ) {
    const refundStampPath = "./assets/img/refund.png";
    const refundEmbed = new EmbedBuilder()
      .setColor("#ff9900")
      .setTitle(`💸 Order Refund: ${item.name}`)
      .setDescription(
        `Order **${transactionId}** for **${item.name}** has been marked for refund by <@${i.user.id}>.`,
      )
      .addFields([
        { name: "Refund Reason", value: refundReason, inline: false },
        { name: "Transaction ID", value: transactionId, inline: false },
      ])
      .addFields([
        { name: "Item", value: item.name, inline: false },
        { name: "Price", value: formatBalance(item.price), inline: false },
      ])
      .addFields([
        {
          name: "Customer",
          value: `<@${interaction.user.id}>`,
          inline: false,
        },
        {
          name: "Customer DiscordID",
          value: interaction.user.id,
          inline: false,
        },
      ])
      .addFields([
        {
          name: "Refunded By",
          value: `<@${i.user.id}>`,
          inline: false,
        },
        {
          name: "Refunded By DiscordID",
          value: i.user.id,
          inline: false,
        },
      ])
      .setTimestamp();
    refundEmbed.setImage(refundProof);
    if (refundStampPath) {
      refundEmbed.setThumbnail(`attachment://refund.png`);
    }

    return refundEmbed;
  }
  static async rejection(
    i: Interaction,
    interaction: Interaction,
    item: any,
    transactionId: string,
    reason: string,
    content: string = "",
  ) {
    const files = [];
    const rejectionEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle(`❌ Order Rejected: ${item.name}`)
      .setDescription(
        `Order **${transactionId}** for **${item.name}** has been rejected by <@${i.user.id}>.`,
      )
      .addFields([
        { name: "Rejection Reason", value: reason, inline: false },
        { name: "Transaction ID", value: transactionId, inline: false },
      ])
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
          name: "Rejected by :",
          value: `<@${i.user.id}>`,
          inline: true,
        },
        { name: "Rejected by DiscordID", value: i.user.id, inline: true },
        {
          name: "Item Location in Shop",
          value:
            itemPurchasePath
              .get(transactionId)
              ?.map((node) => node.name)
              .join(" > ") || "Unknown",
          inline: false,
        },
      ])
      .setTimestamp();
    const rejectedPath = `./assets/img/rejected.png`;
    if (rejectedPath) {
      rejectionEmbed.setThumbnail(`attachment://rejected.png`);
    }
    if (fs.existsSync(rejectedPath)) {
      files.push(rejectedPath);
    }
    const messageToSend = {
      content: content,
      embeds: [rejectionEmbed],
      files: [...files],
    };

    return messageToSend;
  }
}
