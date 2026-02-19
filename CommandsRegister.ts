import { REST, Routes } from "discord.js";

const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
  },
  {
    name: "shop",
    description: "Displays the shop items.",
  },
];

export async function registerCommands(
  botToken?: string,
  botAppId?: string,
  guildId?: string,
) {
  const rest = new REST({ version: "10" }).setToken(
    botToken || process.env.BOT_TOKEN!,
  );

  try {
    console.log("Refreshing guild (/) commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        botAppId || process.env.BOT_APP_ID!,
        guildId || process.env.GUILD_ID!,
      ),
      { body: commands },
    );

    console.log("Guild slash commands refreshed instantly.");
  } catch (error) {
    console.error(error);
  }
}
