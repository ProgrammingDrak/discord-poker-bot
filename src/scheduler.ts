import { Client } from "discord.js";
import { DateTime } from "luxon";
import { BotConfig } from "./config.js";
import { getNextWeeklyRun, millisUntil } from "./dates.js";
import { logger } from "./logger.js";
import {
  postPollSummaryIfFinalized,
  postRecentFinalizedPokerPollSummaries,
  postScheduledPokerPollIfNeeded
} from "./polls.js";
import { PollStore, StoredPoll } from "./store.js";

const RESULT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const FINALIZATION_RETRY_COUNT = 6;
const FINALIZATION_RETRY_DELAY_MS = 30 * 1000;

export function startSchedulers(client: Client, config: BotConfig, store: PollStore): void {
  scheduleNextWeeklyPoll(client, config, store);

  void checkDuePollSummaries(client, store);
  setInterval(() => {
    void checkDuePollSummaries(client, store);
  }, RESULT_CHECK_INTERVAL_MS);
}

function scheduleNextWeeklyPoll(client: Client, config: BotConfig, store: PollStore): void {
  const nextRun = getNextWeeklyRun(DateTime.now(), config.timezone);
  const delay = millisUntil(nextRun);

  logger.info("Scheduled next weekly poker poll", {
    nextRun: nextRun.toISO(),
    timezone: config.timezone
  });

  setTimeout(() => {
    void (async () => {
      await postScheduledPollIfNeeded(client, config, store);
      scheduleNextWeeklyPoll(client, config, store);
    })();
  }, delay);
}

async function postScheduledPollIfNeeded(
  client: Client,
  config: BotConfig,
  store: PollStore
): Promise<void> {
  await postScheduledPokerPollIfNeeded(client, config, store);
}

export async function checkDuePollSummaries(client: Client, store: PollStore): Promise<number> {
  const duePolls = store.listPollsDueForSummary(DateTime.utc().toISO() ?? "");
  let checked = 0;

  for (const poll of duePolls) {
    await summarizeWithBriefRetry(client, store, poll);
    checked += 1;
  }

  return checked;
}

export async function checkDuePollSummariesWithFallback(
  client: Client,
  config: BotConfig,
  store: PollStore
): Promise<number> {
  const checkedStoredPolls = await checkDuePollSummaries(client, store);
  const postedRecentSummaries = await postRecentFinalizedPokerPollSummaries(client, config);
  return checkedStoredPolls + postedRecentSummaries;
}

async function summarizeWithBriefRetry(
  client: Client,
  store: PollStore,
  poll: StoredPoll
): Promise<void> {
  for (let attempt = 1; attempt <= FINALIZATION_RETRY_COUNT; attempt += 1) {
    try {
      const posted = await postPollSummaryIfFinalized(client, poll);
      if (posted) {
        store.markSummaryPosted(poll.messageId, DateTime.utc().toISO() ?? "");
        logger.info("Posted poker poll summary", {
          messageId: poll.messageId,
          channelId: poll.channelId
        });
        return;
      }
    } catch (error) {
      logger.error("Failed to check poker poll summary", {
        messageId: poll.messageId,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    if (attempt < FINALIZATION_RETRY_COUNT) {
      await delay(FINALIZATION_RETRY_DELAY_MS);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
