import {
  type APIMessage,
  type APIPoll,
  type APIPollAnswer,
  type RESTGetAPIChannelMessagesResult,
  type Snowflake,
  Routes
} from "discord-api-types/v10";
import {
  ChannelType,
  Client,
  type GuildTextBasedChannel,
  type Message,
  type PollData,
  PollLayoutType
} from "discord.js";
import { DateTime } from "luxon";
import { BotConfig } from "./config.js";
import { getNextPokerWeek, getPollCloseTime, getPollDurationHours } from "./dates.js";
import { logger } from "./logger.js";
import { PollSource, PollStore, StoredPoll } from "./store.js";

const POLL_QUESTION = "When can you play poker this week?";
const POLL_CONTENT = "@everyone Vote for every night you could play poker this week.";
const OUT_THIS_WEEK_OPTION = "Out this week 😔";

export type WinnerSummaryInput = {
  answers: Array<{ id: number; text: string }>;
  counts: Array<{ id: number; count: number }>;
};

export function buildPokerPoll(now: DateTime, timezone: string): {
  poll: PollData;
  weekStart: string;
  weekEnd: string;
  closeAtISO: string;
} {
  const week = getNextPokerWeek(now, timezone);

  return {
    weekStart: week.weekStartISO,
    weekEnd: week.weekEndISO,
    closeAtISO: getPollCloseTime(now, timezone).toUTC().toISO() ?? "",
    poll: {
      question: { text: POLL_QUESTION },
      answers: [...week.optionLabels, OUT_THIS_WEEK_OPTION].map((text) => ({ text })),
      duration: getPollDurationHours(now, timezone),
      allowMultiselect: true,
      layoutType: PollLayoutType.Default
    }
  };
}

export async function postPokerPoll(
  client: Client,
  config: BotConfig,
  store: PollStore,
  source: PollSource
): Promise<Message> {
  const now = DateTime.now().setZone(config.timezone);
  const { poll, weekStart, weekEnd, closeAtISO } = buildPokerPoll(now, config.timezone);
  const channel = await fetchSendableChannel(client, config.pokerChannelId);
  const message = await channel.send({
    content: POLL_CONTENT,
    allowedMentions: { parse: ["everyone"] },
    poll
  });

  store.recordPoll({
    messageId: message.id,
    channelId: message.channelId,
    weekStart,
    weekEnd,
    expectedCloseAt: closeAtISO,
    summaryPostedAt: null,
    source,
    createdAt: now.toUTC().toISO() ?? ""
  });

  logger.info("Posted poker poll", {
    messageId: message.id,
    channelId: message.channelId,
    weekStart,
    weekEnd,
    source
  });

  return message;
}

export async function postScheduledPokerPollIfNeeded(
  client: Client,
  config: BotConfig,
  store: PollStore
): Promise<Message | null> {
  const week = getNextPokerWeek(DateTime.now(), config.timezone);
  const existingPoll = store.findScheduledPollForWeek(week.weekStartISO);

  if (existingPoll) {
    logger.info("Skipping duplicate scheduled poker poll", {
      weekStart: week.weekStartISO,
      messageId: existingPoll.messageId
    });
    return null;
  }

  return postPokerPoll(client, config, store, "scheduled");
}

export async function postPollSummaryIfFinalized(
  client: Client,
  poll: StoredPoll
): Promise<boolean> {
  const apiMessage = (await client.rest.get(
    Routes.channelMessage(poll.channelId, poll.messageId)
  )) as APIMessage;

  if (!apiMessage.poll) {
    logger.warn("Stored poker poll message no longer has poll data", {
      messageId: poll.messageId,
      channelId: poll.channelId
    });
    return false;
  }

  if (!apiMessage.poll.results?.is_finalized) {
    logger.info("Poker poll results are not finalized yet", {
      messageId: poll.messageId,
      channelId: poll.channelId
    });
    return false;
  }

  const channel = await fetchSendableChannel(client, poll.channelId);
  await channel.send(formatWinnerSummaryMessage(apiMessage.poll, poll.messageId));
  return true;
}

export async function postRecentFinalizedPokerPollSummaries(
  client: Client,
  config: BotConfig
): Promise<number> {
  const messages = (await client.rest.get(Routes.channelMessages(config.pokerChannelId), {
    query: new URLSearchParams({ limit: "100" })
  })) as RESTGetAPIChannelMessagesResult;

  const botId = client.user?.id;
  const alreadySummarized = new Set(
    messages
      .filter((message) => message.author.id === botId)
      .flatMap((message) => [...message.content.matchAll(/Poll ID: `(\d+)`/g)].map((match) => match[1]))
      .filter((messageId): messageId is Snowflake => Boolean(messageId))
  );

  const finalizedPolls = messages
    .filter((message) => message.author.id === botId)
    .filter((message) => message.content === POLL_CONTENT)
    .filter((message) => message.poll?.results?.is_finalized)
    .filter((message) => !alreadySummarized.has(message.id));

  const channel = await fetchSendableChannel(client, config.pokerChannelId);
  let posted = 0;

  for (const message of finalizedPolls.reverse()) {
    if (!message.poll) {
      continue;
    }

    await channel.send(formatWinnerSummaryMessage(message.poll, message.id));
    posted += 1;
  }

  return posted;
}

export function formatWinnerSummary(input: WinnerSummaryInput): string {
  const countByAnswerId = new Map(input.counts.map((count) => [count.id, count.count]));
  const answerResults = input.answers.map((answer) => ({
    ...answer,
    count: countByAnswerId.get(answer.id) ?? 0
  }));

  const maxVotes = Math.max(...answerResults.map((answer) => answer.count), 0);
  if (maxVotes === 0) {
    return "Poker poll is closed: no votes were cast this week.";
  }

  const winners = answerResults.filter((answer) => answer.count === maxVotes);
  const voteText = maxVotes === 1 ? "1 vote" : `${maxVotes} votes`;

  if (winners.length === 1) {
    return `Poker poll is closed. Top choice: ${winners[0]?.text} with ${voteText}.`;
  }

  return `Poker poll is closed. Top choices are ${formatList(
    winners.map((winner) => winner.text)
  )} with ${voteText} each.`;
}

export function formatWinnerSummaryFromPoll(poll: APIPoll): string {
  return formatWinnerSummary(extractWinnerSummaryInput(poll));
}

function formatWinnerSummaryMessage(poll: APIPoll, messageId: string): string {
  return `${formatWinnerSummaryFromPoll(poll)}\nPoll ID: \`${messageId}\``;
}

function extractWinnerSummaryInput(poll: APIPoll): WinnerSummaryInput {
  return {
    answers: poll.answers.map((answer) => ({
      id: answer.answer_id,
      text: pollAnswerText(answer)
    })),
    counts:
      poll.results?.answer_counts.map((count) => ({
        id: count.id,
        count: count.count
      })) ?? []
  };
}

function pollAnswerText(answer: APIPollAnswer): string {
  return answer.poll_media.text ?? `Answer ${answer.answer_id}`;
}

function formatList(items: string[]): string {
  if (items.length <= 2) {
    return items.join(" and ");
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

async function fetchSendableChannel(
  client: Client,
  channelId: string
): Promise<GuildTextBasedChannel> {
  const channel = await client.channels.fetch(channelId);

  if (!channel?.isTextBased() || channel.type === ChannelType.DM) {
    throw new Error(`Configured channel ${channelId} is not a guild text channel`);
  }

  return channel as GuildTextBasedChannel;
}
