import "dotenv/config";
import path from "node:path";

export type BotConfig = {
  discordToken: string;
  clientId: string;
  guildId: string;
  pokerChannelId: string;
  timezone: string;
  databasePath: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): BotConfig {
  return {
    discordToken: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: required("DISCORD_GUILD_ID"),
    pokerChannelId: required("POKER_CHANNEL_ID"),
    timezone: process.env.TIMEZONE ?? "America/New_York",
    databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/poker-bot.sqlite")
  };
}
