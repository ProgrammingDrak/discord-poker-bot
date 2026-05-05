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

for (const poll of state.polls) {
  if (poll.summaryPostedAt || poll.expectedCloseAt > nowISO) {
    continue;
  }

  const message = (await rest.get(
    Routes.channelMessage(poll.channelId, poll.messageId)
  )) as APIMessage;

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
  posted += 1;
}

if (posted > 0) {
  await saveGithubState(state);
}

logger.info("Checked GitHub-scheduled poll summaries", { posted });
