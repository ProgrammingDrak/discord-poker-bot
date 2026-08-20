import "dotenv/config";
import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";
import { jobs } from "../jobs/index.js";
import { resolveChannel } from "../runtime/config.js";

// Preflight for the whole fleet: for every registered effector, is its channel
// configured, does the bot have the permissions it needs, and is it pointed at a
// real channel?
//
// Worth running after adding a job or rotating secrets. A silent effector is
// almost always one of these three, and all three are invisible in a workflow
// log that just says "skipped".

const REQUIRED = {
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  SendPolls: PermissionFlagsBits.SendPolls
};

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN");
}
if (!guildId) {
  throw new Error("Missing DISCORD_GUILD_ID");
}

let failures = 0;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async (readyClient) => {
  const guild = await readyClient.guilds.fetch(guildId);
  const botMember = await guild.members.fetchMe();
  console.log(`Guild: ${guild.name} (${guild.id})`);

  for (const job of jobs) {
    const channelId = resolveChannel(job.channelEnv);
    const label = `${job.name} [${job.enabled ? "enabled" : "disabled"}]`;

    if (!channelId) {
      console.log(`${label}: MISSING ${job.channelEnv}`);
      if (job.enabled) {
        failures += 1;
      }
      continue;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.log(`${label}: channel ${channelId} not found in this guild`);
      failures += 1;
      continue;
    }

    const permissions = channel.permissionsFor(botMember);
    const missing = Object.entries(REQUIRED)
      .filter(([, flag]) => !permissions?.has(flag))
      .map(([name]) => name);

    if (missing.length === 0) {
      console.log(`${label}: #${channel.name} (${channel.id}) ok`);
    } else {
      console.log(`${label}: #${channel.name} (${channel.id}) MISSING ${missing.join(", ")}`);
      failures += 1;
    }
  }

  await readyClient.destroy();
  process.exit(failures === 0 ? 0 : 1);
});

await client.login(token);
