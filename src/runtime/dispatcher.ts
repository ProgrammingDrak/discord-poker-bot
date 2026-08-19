import { DateTime } from "luxon";
import { Job } from "../jobs/types.js";
import { RuntimeConfig, resolveChannel } from "./config.js";
import { DiscordPoster } from "./discord.js";
import { logger } from "./logger.js";
import { evaluateSchedule } from "./schedule.js";
import { EffectorsState, findRun, recordBeat, recordRun } from "./state.js";

// The controller. One coarse cron wakes this up, it decides which effectors are
// due, runs them, and writes one state update for the whole fleet.
//
// Two rules it exists to enforce:
//   1. A failing job must never take down the others. Each job is caught
//      individually; the process exit code carries the overall verdict.
//   2. Every decision is recorded, including the boring ones. "Skipped, off
//      week" and "never ran at all" look identical in a log that only records
//      successes, and telling them apart is the whole job of the beat record.

export type DispatchOptions = {
  jobs: Job[];
  now: DateTime;
  config: RuntimeConfig;
  state: EffectorsState;
  poster: DiscordPoster;
  // Run this job regardless of its schedule gate. Manual dispatch.
  force?: boolean;
  // Also ignore the dedup check. Only for deliberately re-posting.
  forceRepost?: boolean;
};

export type DispatchResult = {
  job: string;
  status: "posted" | "skipped" | "error";
  detail: string;
  durationMs: number;
};

export async function dispatch(options: DispatchOptions): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];

  for (const job of options.jobs) {
    const startedAt = Date.now();
    const result = await runOne(job, options, startedAt);
    results.push(result);

    recordBeat(options.state, {
      job: job.name,
      status: result.status,
      at: options.now.toUTC().toISO() ?? new Date().toISOString(),
      durationMs: result.durationMs,
      detail: result.detail
    });
  }

  return results;
}

async function runOne(
  job: Job,
  options: DispatchOptions,
  startedAt: number
): Promise<DispatchResult> {
  const { now, config, state, poster, force, forceRepost } = options;
  const done = (status: DispatchResult["status"], detail: string): DispatchResult => ({
    job: job.name,
    status,
    detail,
    durationMs: Date.now() - startedAt
  });

  if (!job.enabled) {
    return done("skipped", "job is disabled in the registry");
  }

  if (!force && config.enforceSchedule) {
    const decision = evaluateSchedule(job.schedule, now, config.timezone);
    if (!decision.due) {
      return done("skipped", decision.reason);
    }
  }

  const channelId = resolveChannel(job.channelEnv);
  if (!channelId) {
    // A due job with no channel is a misconfiguration, not a quiet skip. Surface
    // it as an error so a missing repository secret cannot silently mean "this
    // poll just stopped happening" for weeks.
    return done("error", `channel not configured: set ${job.channelEnv}`);
  }

  const dedupKey = job.dedupKey({ now, timezone: config.timezone });

  if (!forceRepost) {
    const existing = findRun(state, job.name, dedupKey);
    if (existing) {
      return done("skipped", `already ran for ${dedupKey} (message ${existing.messageId ?? "?"})`);
    }
  }

  try {
    const outcome = await job.run({
      now,
      timezone: config.timezone,
      channelId,
      poster
    });

    if (outcome.status === "skipped") {
      return done("skipped", outcome.detail);
    }

    recordRun(state, {
      job: job.name,
      dedupKey,
      ranAt: now.toUTC().toISO() ?? new Date().toISOString(),
      messageId: outcome.message.id,
      channelId: outcome.message.channelId,
      expectedCloseAt: outcome.expectedCloseAt ?? null,
      meta: outcome.meta
    });

    logger.info("Effector posted", {
      job: job.name,
      dedupKey,
      messageId: outcome.message.id,
      channelId: outcome.message.channelId
    });

    return done("posted", outcome.detail);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("Effector failed", { job: job.name, dedupKey, detail });
    return done("error", detail);
  }
}

export function summarize(results: DispatchResult[]): string {
  const counts = { posted: 0, skipped: 0, error: 0 };
  for (const result of results) {
    counts[result.status] += 1;
  }
  return `posted ${counts.posted}, skipped ${counts.skipped}, errored ${counts.error}`;
}

export function hasError(results: DispatchResult[]): boolean {
  return results.some((result) => result.status === "error");
}
