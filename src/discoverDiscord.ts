import "dotenv/config";
import { ChannelType, Client, Events, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN in .env");
}

const applicationResponse = await fetch("https://discord.com/api/v10/oauth2/applications/@me", {
  headers: {
    Authorization: `Bot ${token}`
  }
});

const application = (await applicationResponse.json()) as {
  id?: string;
  name?: string;
  message?: string;
  code?: number;
};

if (!applicationResponse.ok || !application.id) {
  throw new Error(
    `Discord rejected the bot token: ${application.message ?? "unknown error"} (${application.code ?? applicationResponse.status})`
  );
}

console.log(`Application: ${application.name ?? "unknown"} (${application.id})`);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot user: ${readyClient.user.tag}`);

  if (readyClient.guilds.cache.size === 0) {
    console.log("No guilds found. Invite the bot to your server, then run this command again.");
    await readyClient.destroy();
    return;
  }

  for (const guild of readyClient.guilds.cache.values()) {
    console.log(`Guild: ${guild.name} (${guild.id})`);
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
      if (!channel) {
        continue;
      }

      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
        console.log(`  #${channel.name} (${channel.id})`);
      }
    }
  }

  await readyClient.destroy();
});

await client.login(token);
