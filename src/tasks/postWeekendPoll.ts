import { REST, Routes } from "discord.js";
import { DateTime } from "luxon";
import { loadConfig } from "../config.js";
import { logger } from "../logger.js";

// One-off poll: the upcoming Friday, Saturday, and Sunday, dated.
// Posted manually through the Weekend Poll workflow_dispatch. This task does
// not touch GitHub issue state, so it stays independent of the weekly poll.

const config = loadConfig();
const now = DateTime.now().setZone(config.timezone);

// Luxon weekday: Monday = 1 ... Friday = 5, Saturday = 6, Sunday = 7.
const daysUntilFriday = (((5 - now.weekday) % 7) + 7) % 7;
const friday = now.plus({ days: daysUntilFriday }).startOf("day");
const weekendDays = [0, 1, 2].map((offset) => friday.plus({ days: offset }));

const rest = new REST({ version: "10" }).setToken(config.discordToken);
const message = (await rest.post(Routes.channelMessages(config.pokerChannelId), {
  body: {
    content: "@everyone Poker this weekend? Vote for every night you could play.",
    allowed_mentions: { parse: ["everyone"] },
    poll: {
      question: { text: "When can you play poker this weekend?" },
      answers: weekendDays.map((day) => ({
        poll_media: { text: day.toFormat("cccc, LLLL d") }
      })),
      duration: 96,
      allow_multiselect: true,
      layout_type: 1
    }
  }
})) as { id: string; channel_id: string };

logger.info("Posted one-off weekend poker poll", {
  messageId: message.id,
  channelId: message.channel_id,
  days: weekendDays.map((day) => day.toISODate())
});
