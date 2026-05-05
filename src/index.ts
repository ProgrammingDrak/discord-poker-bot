import {
  Client,
  Events,
  GatewayIntentBits
} from "discord.js";
import { loadConfig } from "./config.js";
import { startHealthServer } from "./healthServer.js";
import { logger } from "./logger.js";
import { startSchedulers } from "./scheduler.js";
import { PollStore } from "./store.js";

const config = loadConfig();
const store = new PollStore(config.databasePath);
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});
const healthServer = startHealthServer({ client, config, store });

client.once(Events.ClientReady, (readyClient) => {
  logger.info("Discord poker bot is ready", {
    user: readyClient.user.tag
  });

  if (config.disableInternalScheduler) {
    logger.info("Internal scheduler is disabled");
    return;
  }

  startSchedulers(readyClient, config, store);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await client.login(config.discordToken);

function shutdown(signal: string): void {
  logger.info("Shutting down Discord poker bot", { signal });
  store.close();
  healthServer?.close();
  client.destroy();
  process.exit(0);
}
