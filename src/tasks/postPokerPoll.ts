import { REST, Routes } from "discord.js";
import { DateTime } from "luxon";
import { loadConfig } from "../config.js";
import { isWeeklyPollWindow, POKER_POLL_DURATION_HOURS } from "../dates.js";
import { loadGithubState, saveGithubState } from "../githubState.js";
import { logger } from "../logger.js";
import { buildPokerPoll } from "../polls.js";

const config = loadConfig();
const shouldEnforceWindow = process.env.ENFORCE_POLL_WINDOW === "true";

if (shouldEnforceWindow && !isWeeklyPollWindow(DateTime.now(), config.timezone)) {
  logger.info("Skipping scheduled poker poll outside poll window");
  process.exit(0);
}

const now = DateTime.now().setZone(config.timezone);
const { poll, weekStart, weekEnd } = buildPokerPoll(now, config.timezone);
const state = await loadGithubState();
const existingPoll = state.polls.find((storedPoll) => storedPoll.weekStart === weekStart);

if (existingPoll) {
  logger.info("Skipping duplicate GitHub-scheduled poker poll", {
    weekStart,
    messageId: existingPoll.messageId
  });
  process.exit(0);
}

const rest = new REST({ version: "10" }).setToken(config.discordToken);
const message = (await rest.post(Routes.channelMessages(config.pokerChannelId), {
  body: {
    content: "@everyone Vote for every night you could play poker next week.",
    allowed_mentions: { parse: ["everyone"] },
    poll: {
      question: poll.question,
      answers: poll.answers.map((answer) => ({
        poll_media: { text: answer.text, emoji: answer.emoji }
      })),
      duration: poll.duration,
      allow_multiselect: poll.allowMultiselect,
      layout_type: poll.layoutType
    }
  }
})) as { id: string; channel_id: string };

state.polls.push({
  messageId: message.id,
  channelId: message.channel_id,
  weekStart,
  weekEnd,
  expectedCloseAt: now.plus({ hours: POKER_POLL_DURATION_HOURS }).toUTC().toISO() ?? "",
  summaryPostedAt: null
});

await saveGithubState(state);

logger.info("Posted GitHub-scheduled poker poll", {
  messageId: message.id,
  channelId: message.channel_id,
  weekStart,
  weekEnd
});
