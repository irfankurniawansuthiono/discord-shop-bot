import { Client, Events, GatewayIntentBits } from "discord.js";
import { registerCommands } from "./CommandsRegister";
import { getShopCategories, shopMenu } from "./utils/shopSelector";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_APP_ID = process.env.BOT_APP_ID;
if (!BOT_TOKEN) {
  console.error(
    "Error: BOT_TOKEN is not defined in the environment variables.",
  );
  process.exit(1);
}

if (!BOT_APP_ID) {
  console.error(
    "Error: BOT_APP_ID is not defined in the environment variables.",
  );
  process.exit(1);
}

async function initBot() {
  await registerCommands(BOT_TOKEN, BOT_APP_ID, process.env.GUILD_ID);
  getShopCategories();
}

client.on(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}!`);
  await initBot();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case "ping":
      await interaction.reply("Pong!");
      break;
    case "shop":
      await shopMenu(interaction);
      break;
  }
});

client.login(process.env.BOT_TOKEN!);
