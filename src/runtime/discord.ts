import { REST, Routes } from "discord.js";
import { logger } from "./logger.js";

// The one place that knows Discord's REST quirks. Every job posts through here.
//
// Raw REST rather than a gateway client on purpose: a GitHub Actions job is a
// short-lived process, and logging a websocket client in just to send one
// message costs seconds and can hang the runner waiting on a ready event.
//
// Poll payload gotchas, learned the hard way and easy to regress:
//   - answers use `poll_media.text`, not `text`
//   - the flags are snake_case (`allow_multiselect`, `layout_type`)
//   - `duration` is whole hours
//   - @everyone needs BOTH `allowed_mentions` here and the permission in Discord

export const DISCORD_MAX_POLL_ANSWERS = 10;

export type PollBody = {
  question: { text: string };
  answers: Array<{ poll_media: { text: string } }>;
  duration: number;
  allow_multiselect: boolean;
  layout_type: number;
};

export type PostedMessage = {
  id: string;
  channelId: string;
};

export type DiscordPoster = {
  postPoll(input: {
    channelId: string;
    content: string;
    mentionEveryone?: boolean;
    poll: PollBody;
  }): Promise<PostedMessage>;
  postMessage(input: {
    channelId: string;
    content: string;
    mentionEveryone?: boolean;
  }): Promise<PostedMessage>;
};

export function buildPoll(input: {
  question: string;
  answers: string[];
  durationHours: number;
  allowMultiselect?: boolean;
}): PollBody {
  if (input.answers.length > DISCORD_MAX_POLL_ANSWERS) {
    throw new Error(
      `Discord allows at most ${DISCORD_MAX_POLL_ANSWERS} poll answers, got ${input.answers.length}`
    );
  }

  if (input.answers.length === 0) {
    throw new Error("A poll needs at least one answer");
  }

  return {
    question: { text: input.question },
    answers: input.answers.map((text) => ({ poll_media: { text } })),
    duration: Math.max(1, Math.round(input.durationHours)),
    allow_multiselect: input.allowMultiselect ?? true,
    layout_type: 1
  };
}

export function createPoster(token: string, dryRun: boolean): DiscordPoster {
  if (dryRun) {
    return dryRunPoster();
  }

  const rest = new REST({ version: "10" }).setToken(token);

  const send = async (channelId: string, body: Record<string, unknown>): Promise<PostedMessage> => {
    const message = (await rest.post(Routes.channelMessages(channelId), { body })) as {
      id: string;
      channel_id: string;
    };
    return { id: message.id, channelId: message.channel_id };
  };

  return {
    postPoll: ({ channelId, content, mentionEveryone, poll }) =>
      send(channelId, {
        content,
        ...(mentionEveryone ? { allowed_mentions: { parse: ["everyone"] } } : {}),
        poll
      }),
    postMessage: ({ channelId, content, mentionEveryone }) =>
      send(channelId, {
        content,
        ...(mentionEveryone ? { allowed_mentions: { parse: ["everyone"] } } : {})
      })
  };
}

// Prints what would have been sent and returns a fake message id. Lets the full
// dispatcher path, including dedup writes, be exercised without posting.
function dryRunPoster(): DiscordPoster {
  let counter = 0;
  const fake = (channelId: string, payload: unknown): PostedMessage => {
    counter += 1;
    logger.info("[dry-run] would post to Discord", { channelId, payload });
    return { id: `dry-run-${counter}`, channelId };
  };

  return {
    postPoll: async (input) => fake(input.channelId, { content: input.content, poll: input.poll }),
    postMessage: async (input) => fake(input.channelId, { content: input.content })
  };
}
