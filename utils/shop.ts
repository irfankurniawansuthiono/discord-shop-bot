import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type MessageActionRowComponentBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { ChatInputCommandInteraction } from "discord.js";
import fs from "fs";

// store information
import { STORE_DESCRIPTION, STORE_NAME } from "../config";
import { formatBalance } from "./formatBalance";
// Notification
import { Payment } from "./Shop/paymentProof";
import { Order } from "./Shop/order";

let shopData: any = null;

export function getShopCategories() {
  if (!shopData) {
    shopData = JSON.parse(fs.readFileSync("./db/shop.json", "utf-8"));
  }
  return shopData;
}

// Map to store the path for each item purchase transaction
export const itemPurchasePath = new Map<
  string,
  { id: string; name: string }[]
>();

export async function shopMenu(interaction: ChatInputCommandInteraction) {
  try {
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
          {
            id: selectedCategoryId.toString(),
            name: selectedCategoryItems.name,
          },
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
  } catch (error) {
    console.error("Error in shopMenu:", error);
    await interaction.followUp({
      content: `❌ An error occurred while loading the shop. Please try again later.`,
    });
  }
}

async function showMenu(
  interaction: StringSelectMenuInteraction,
  node: any,
  path: { id: string; name: string }[],
) {
  try {
    const embed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle(`📂 ${node.name}`)
      .setDescription(node.description || "No description available.");

    if (!node.items || node.items.length === 0) {
      return await showItemDetails(interaction, node, path);
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
      try {
        await interaction.editReply({ components: [] });
      } catch (err) {
        console.error("Failed to clear components:", err);
      }
    });
  } catch (error) {
    console.error("Error in showMenu:", error);
    await interaction.followUp({
      content: `❌ An error occurred while loading the menu. Please try again later.`,
    });
  }
}

async function showItemDetails(
  interaction: StringSelectMenuInteraction,
  item: any,
  path: { id: string; name: string }[],
) {
  try {
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
        const channel = await Order.createChannelOrder(
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
        if (!channel) {
          await i.followUp({
            content: `❌ An error occurred while creating the order channel. Please try again later.`,
          });
          return;
        }
        const payment = new Payment();
        await payment.createPaymentProof(
          interaction,
          transactionId,
          item,
          channel,
        );
      } else if (i.customId === "cancel") {
        await i.update({
          content: `❌ Purchase cancelled for **${item.name}**`,
          embeds: [],
          components: [],
        });
      }
    });

    collector.on("end", async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch (err) {
        console.error("Failed to clear components:", err);
      }
    });
  } catch (error) {
    console.error("Error in showItemDetails:", error);
    await interaction.followUp({
      content: `❌ An error occurred while loading the item details. Please try again later.`,
    });
  }
}
