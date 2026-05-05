import http from "node:http";
import { Client } from "discord.js";
import { DateTime } from "luxon";
import { BotConfig } from "./config.js";
import { isWeeklyPollWindow } from "./dates.js";
import { logger } from "./logger.js";
import { postScheduledPokerPollIfNeeded } from "./polls.js";
import { checkDuePollSummariesWithFallback } from "./scheduler.js";
import { PollStore } from "./store.js";

type TaskContext = {
  client: Client;
  config: BotConfig;
  store: PollStore;
};

export function startHealthServer(context: TaskContext): http.Server | null {
  const port = process.env.PORT;
  if (!port) {
    return null;
  }

  const server = http.createServer((request, response) => {
    void handleRequest(request, response, context);
  });

  server.listen(Number(port), "0.0.0.0", () => {
    logger.info("Health server is listening", { port });
  });

  return server;
}

async function handleRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  context: TaskContext
): Promise<void> {
  try {
    if (request.url === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/tasks/poker-poll") {
      if (!authorizeTask(request, url, context.config)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      if (
        url.searchParams.get("scheduled") === "1" &&
        !isWeeklyPollWindow(DateTime.now(), context.config.timezone)
      ) {
        sendJson(response, 200, { ok: true, posted: false, reason: "outside_poll_window" });
        return;
      }

      const message = await postScheduledPokerPollIfNeeded(
        context.client,
        context.config,
        context.store
      );
      sendJson(response, 200, {
        ok: true,
        posted: Boolean(message),
        messageId: message?.id,
        channelId: message?.channelId
      });
      return;
    }

    if (url.pathname === "/tasks/check-summaries") {
      if (!authorizeTask(request, url, context.config)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      const checked = await checkDuePollSummariesWithFallback(
        context.client,
        context.config,
        context.store
      );
      sendJson(response, 200, { ok: true, checked });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    logger.error("HTTP task request failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    sendJson(response, 500, { error: "internal_error" });
  }
}

function authorizeTask(
  request: http.IncomingMessage,
  url: URL,
  config: BotConfig
): boolean {
  if (!config.taskSecret) {
    return false;
  }

  const headerSecret = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  const querySecret = url.searchParams.get("secret");
  return headerSecret === config.taskSecret || querySecret === config.taskSecret;
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
