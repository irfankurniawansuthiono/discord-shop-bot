import {
  ButtonInteraction,
  EmbedBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { STORE_DESCRIPTION, STORE_NAME } from "../../config";
import { formatBalance } from "../formatBalance";
import { itemPurchasePath } from "../shop";

export class Receipt {
  static async createReceipt(
    interaction: StringSelectMenuInteraction | ButtonInteraction,
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
          value: `Name: ${STORE_NAME}\nDescription: ${STORE_DESCRIPTION || "No description available."}`,
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
}
