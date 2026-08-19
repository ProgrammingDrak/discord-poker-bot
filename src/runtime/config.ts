import "dotenv/config";

// Shared runtime config for every effector. Deliberately lazy about channels:
// each job names the env var holding its own channel id, so a missing channel
// for one job never stops an unrelated job from running. The old per-bot config
// required every channel up front, which is why adding a second poll meant
// touching the first poll's required-env list.

export type RuntimeConfig = {
  discordToken: string;
  guildId: string | null;
  timezone: string;
  dryRun: boolean;
  // When true, schedule gates are enforced. Manual dispatch sets this false so a
  // job can be fired off-window for testing.
  enforceSchedule: boolean;
};

export class MissingConfigError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingConfigError";
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingConfigError(name);
  }
  return value;
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    discordToken: required("DISCORD_TOKEN"),
    guildId: process.env.DISCORD_GUILD_ID ?? null,
    timezone: process.env.TIMEZONE ?? "America/New_York",
    dryRun: process.env.EFFECTORS_DRY_RUN === "true",
    enforceSchedule: process.env.ENFORCE_SCHEDULE !== "false"
  };
}

// Channel ids can arrive two ways:
//
//   1. A plain env var per job (`QUEST_BOARD_CHANNEL_ID=...`), which is what a
//      local `.env` wants.
//   2. One `EFFECTOR_CHANNELS` JSON blob mapping env names to ids, which is what
//      GitHub Actions wants: adding a job then means editing one existing secret
//      instead of creating a new secret AND wiring it through the workflow file.
//
// Explicit env wins, so a local override always beats the shared blob.
let channelMap: Record<string, string> | null = null;

function loadChannelMap(): Record<string, string> {
  if (channelMap) {
    return channelMap;
  }

  const raw = process.env.EFFECTOR_CHANNELS;
  if (!raw) {
    channelMap = {};
    return channelMap;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`EFFECTOR_CHANNELS is not valid JSON: ${(error as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("EFFECTOR_CHANNELS must be a JSON object of ENV_NAME to channel id");
  }

  channelMap = Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, String(value)])
  );
  return channelMap;
}

// Resolve a job's channel. Returns null rather than throwing so the dispatcher
// decides whether a missing channel is a skip or an error.
export function resolveChannel(channelEnv: string): string | null {
  return process.env[channelEnv] ?? loadChannelMap()[channelEnv] ?? null;
}

// Test seam: forget the parsed blob so a test can change the env and re-resolve.
export function resetChannelCache(): void {
  channelMap = null;
}
