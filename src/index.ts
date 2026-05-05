import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  MessageFlags
} from "discord.js";
import { loadConfig } from "./config.js";
import { startHealthServer } from "./healthServer.js";
import { logger } from "./logger.js";
import { postPokerPoll } from "./polls.js";
import { startSchedulers } from "./scheduler.js";
import { PollStore } from "./store.js";

const config = loadConfig();
const store = new PollStore(config.databasePath);
const healthServer = startHealthServer();
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, (readyClient) => {
  logger.info("Discord poker bot is ready", {
    user: readyClient.user.tag
  });
  startSchedulers(readyClient, config, store);
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await client.login(config.discordToken);

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "poker-poll") {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const message = await postPokerPoll(client, config, store, "manual");
    await interaction.editReply(`Posted the poker poll in <#${message.channelId}>.`);
  } catch (error) {
    logger.error("Failed to post manual poker poll", {
      error: error instanceof Error ? error.message : String(error)
    });
    await interaction.editReply("I couldn't post the poker poll. Check my logs and channel permissions.");
  }
}

function shutdown(signal: string): void {
  logger.info("Shutting down Discord poker bot", { signal });
  store.close();
  healthServer?.close();
  client.destroy();
  process.exit(0);
}
