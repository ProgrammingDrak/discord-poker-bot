import "dotenv/config";
import path from "node:path";

export type BotConfig = {
  discordToken: string;
  clientId: string;
  guildId: string;
  pokerChannelId: string;
  timezone: string;
  databasePath: string;
  taskSecret: string | null;
  disableInternalScheduler: boolean;
  botStateIssueNumber: number | null;
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
    databasePath: path.resolve(process.env.DATABASE_PATH ?? "./data/poker-bot.sqlite"),
    taskSecret: process.env.TASK_SECRET ?? null,
    disableInternalScheduler: process.env.DISABLE_INTERNAL_SCHEDULER === "true",
    botStateIssueNumber: process.env.BOT_STATE_ISSUE_NUMBER
      ? Number(process.env.BOT_STATE_ISSUE_NUMBER)
      : null
  };
}
