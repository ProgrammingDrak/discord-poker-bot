import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadConfig();

const commands = [
  new SlashCommandBuilder()
    .setName("poker-poll")
    .setDescription("Post this week's poker availability poll.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON()
];

const rest = new REST({ version: "10" }).setToken(config.discordToken);

await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
  body: commands
});

logger.info("Registered Discord slash commands", {
  guildId: config.guildId,
  commands: commands.map((command) => command.name)
});
