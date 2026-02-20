import type {
  ChatInputCommandInteraction,
  GuildMember,
  StringSelectMenuInteraction,
} from "discord.js";
import { SHOP_MANAGER_ROLE_ID } from "../config";
export async function ManagerShopProtector(message: any): Promise<boolean> {
  try {
    const guild = message.guild;

    if (!guild) {
      message.reply({
        content: `❌ Error: Guild not found. Please contact the developer for assistance.`,
      });
      throw new Error("Guild not found");
    }

    // Fetch member
    const member = await guild.members.fetch(message.user.id).catch(() => null);
    if (!member) {
      message.reply({
        content: `❌ Error: Member not found. Please contact the developer for assistance.`,
      });
      throw new Error("Member not found");
    }

    // Check if the member has the required role
    if (!member.roles.cache.has(SHOP_MANAGER_ROLE_ID)) {
      message.reply({
        content: `❌ Sorry you are not allowed to do this action.`,
        ephemeral: true,
      });
      throw new Error("Member does not have the required role");
    }

    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
