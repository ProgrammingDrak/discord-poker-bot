import "dotenv/config";
import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";

const requiredEnv = ["DISCORD_TOKEN", "DISCORD_GUILD_ID", "POKER_CHANNEL_ID"] as const;
for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name} in .env`);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async (readyClient) => {
  const guild = await readyClient.guilds.fetch(process.env.DISCORD_GUILD_ID!);
  const channel = await guild.channels.fetch(process.env.POKER_CHANNEL_ID!);
  const botMember = await guild.members.fetchMe();

  if (!channel) {
    throw new Error("POKER_CHANNEL_ID was not found in the configured guild");
  }

  const permissions = channel.permissionsFor(botMember);
  const checks = {
    ViewChannel: permissions.has(PermissionFlagsBits.ViewChannel),
    SendMessages: permissions.has(PermissionFlagsBits.SendMessages),
    ReadMessageHistory: permissions.has(PermissionFlagsBits.ReadMessageHistory),
    SendPolls: permissions.has(PermissionFlagsBits.SendPolls)
  };

  console.log(`Guild: ${guild.name} (${guild.id})`);
  console.log(`Channel: #${channel.name} (${channel.id})`);
  for (const [name, allowed] of Object.entries(checks)) {
    console.log(`${name}=${allowed}`);
  }

  await readyClient.destroy();
});

await client.login(process.env.DISCORD_TOKEN!);
