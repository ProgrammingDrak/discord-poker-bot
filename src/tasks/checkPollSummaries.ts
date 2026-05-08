import { type APIMessage, Routes } from "discord-api-types/v10";
import { REST } from "discord.js";
import { DateTime } from "luxon";
import { loadConfig } from "../config.js";
import { loadGithubState, saveGithubState } from "../githubState.js";
import { logger } from "../logger.js";
import { formatWinnerSummaryFromPoll } from "../polls.js";

const config = loadConfig();
const state = await loadGithubState();
const rest = new REST({ version: "10" }).setToken(config.discordToken);
const nowISO = DateTime.utc().toISO() ?? "";
let posted = 0;
let stateChanged = false;

for (const poll of state.polls) {
  if (poll.summaryPostedAt || poll.expectedCloseAt > nowISO) {
    continue;
  }

  let message: APIMessage;
  try {
    message = (await rest.get(
      Routes.channelMessage(poll.channelId, poll.messageId)
    )) as APIMessage;
  } catch (error) {
    if (isUnknownMessageError(error)) {
      logger.warn("Stored poll message no longer exists; marking summary as handled", {
        messageId: poll.messageId,
        channelId: poll.channelId
      });
      poll.summaryPostedAt = nowISO;
      stateChanged = true;
      continue;
    }

    throw error;
  }

  if (!message.poll?.results?.is_finalized) {
    logger.info("Poll results are not finalized yet", { messageId: poll.messageId });
    continue;
  }

  await rest.post(Routes.channelMessages(poll.channelId), {
    body: {
      content: `${formatWinnerSummaryFromPoll(message.poll)}\nPoll ID: \`${poll.messageId}\``
    }
  });

  poll.summaryPostedAt = nowISO;
  stateChanged = true;
  posted += 1;
}

if (stateChanged) {
  await saveGithubState(state);
}

logger.info("Checked GitHub-scheduled poll summaries", { posted });

function isUnknownMessageError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; status?: unknown };
  return candidate.code === 10008 || candidate.status === 404;
}
