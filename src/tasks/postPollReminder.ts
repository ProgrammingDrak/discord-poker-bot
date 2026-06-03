import { REST, Routes } from "discord.js";
import { DateTime } from "luxon";
import { loadConfig } from "../config.js";
import { type ReminderKey, reminderKeyForNow } from "../dates.js";
import { loadGithubState, saveGithubState } from "../githubState.js";
import { logger } from "../logger.js";

const config = loadConfig();
const now = DateTime.now().setZone(config.timezone);

// Scheduled runs derive the reminder from the current day/time. A manual
// dispatch can force one with REMINDER_KEY=tuesday|wednesday.
const overrideKey = process.env.REMINDER_KEY as ReminderKey | undefined;
const reminderKey = overrideKey ?? reminderKeyForNow(now, config.timezone);

if (!reminderKey) {
  logger.info("Skipping poll reminder outside reminder window");
  process.exit(0);
}

const nowISO = now.toUTC().toISO() ?? "";
const state = await loadGithubState();

// The active poll is the one still open (close time in the future). If several
// are open, take the one closing soonest, which is the current cycle.
const activePoll = state.polls
  .filter((poll) => poll.expectedCloseAt > nowISO && !poll.summaryPostedAt)
  .sort((a, b) => a.expectedCloseAt.localeCompare(b.expectedCloseAt))
  .at(0);

if (!activePoll) {
  logger.info("Skipping poll reminder: no open poll found", { reminderKey });
  process.exit(0);
}

const alreadySent = activePoll.remindersSent ?? [];
if (alreadySent.includes(reminderKey) && !overrideKey) {
  logger.info("Skipping duplicate poll reminder", {
    reminderKey,
    messageId: activePoll.messageId
  });
  process.exit(0);
}

const pollLink = `https://discord.com/channels/${config.guildId}/${activePoll.channelId}/${activePoll.messageId}`;
const content =
  reminderKey === "wednesday"
    ? `@everyone Last call: the poker poll closes today at 2 PM ET. Get your votes in. ${pollLink}`
    : `@everyone Reminder: vote for this week's poker nights. The poll closes Wednesday at 2 PM ET. ${pollLink}`;

const rest = new REST({ version: "10" }).setToken(config.discordToken);
await rest.post(Routes.channelMessages(activePoll.channelId), {
  body: {
    content,
    allowed_mentions: { parse: ["everyone"] }
  }
});

activePoll.remindersSent = [...new Set([...alreadySent, reminderKey])];
await saveGithubState(state);

logger.info("Posted poker poll reminder", {
  reminderKey,
  messageId: activePoll.messageId,
  channelId: activePoll.channelId
});
