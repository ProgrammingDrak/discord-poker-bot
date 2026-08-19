import { REST, Routes } from "discord.js";
import { DateTime } from "luxon";
import { loadConfig } from "../config.js";
import {
  GAME_NIGHT_CONTENT,
  buildGameNightPoll,
  isGameNightPostWindow,
  isGameNightWindowOnCadence
} from "../gameNight.js";
import { loadGithubState, saveGithubState } from "../githubState.js";
import { logger } from "../logger.js";

// Posts the biweekly game night poll to the quest board channel. The workflow
// fires every Saturday; the cadence check below drops the off weeks so the poll
// lands every other Saturday. Manual dispatch skips both gates.

const config = loadConfig();
const shouldEnforceWindow = process.env.ENFORCE_POLL_WINDOW === "true";

if (!config.questBoardChannelId) {
  throw new Error("Missing required environment variable: QUEST_BOARD_CHANNEL_ID");
}

const now = DateTime.now().setZone(config.timezone);

if (shouldEnforceWindow && !isGameNightPostWindow(now, config.timezone)) {
  logger.info("Skipping scheduled game night poll outside poll window");
  process.exit(0);
}

const { body, window, closeAtISO } = buildGameNightPoll(now, config.timezone);

if (shouldEnforceWindow && !isGameNightWindowOnCadence(window.windowStartISO, config.timezone)) {
  logger.info("Skipping game night poll on an off week", {
    windowStart: window.windowStartISO
  });
  process.exit(0);
}

const state = await loadGithubState();
const existingPoll = state.polls.find(
  (storedPoll) => storedPoll.kind === "gameNight" && storedPoll.weekStart === window.windowStartISO
);

if (existingPoll) {
  logger.info("Skipping duplicate game night poll", {
    windowStart: window.windowStartISO,
    messageId: existingPoll.messageId
  });
  process.exit(0);
}

const rest = new REST({ version: "10" }).setToken(config.discordToken);
const message = (await rest.post(Routes.channelMessages(config.questBoardChannelId), {
  body: {
    content: GAME_NIGHT_CONTENT,
    allowed_mentions: { parse: ["everyone"] },
    poll: body
  }
})) as { id: string; channel_id: string };

state.polls.push({
  messageId: message.id,
  channelId: message.channel_id,
  weekStart: window.windowStartISO,
  weekEnd: window.windowEndISO,
  expectedCloseAt: closeAtISO,
  summaryPostedAt: null,
  remindersSent: [],
  kind: "gameNight"
});

await saveGithubState(state);

logger.info("Posted game night poll", {
  messageId: message.id,
  channelId: message.channel_id,
  windowStart: window.windowStartISO,
  windowEnd: window.windowEndISO,
  nights: window.nightISODates,
  closeAt: closeAtISO,
  durationHours: body.duration
});
