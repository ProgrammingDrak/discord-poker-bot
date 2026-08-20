import { DateTime } from "luxon";
import { findJob, jobNames, jobs as allJobs } from "../jobs/index.js";
import { loadRuntimeConfig } from "../runtime/config.js";
import { createPoster } from "../runtime/discord.js";
import { DispatchResult, dispatch, hasError, summarize } from "../runtime/dispatcher.js";
import { logger } from "../runtime/logger.js";
import { describeSchedule } from "../runtime/schedule.js";
import { loadState, saveState } from "../runtime/state.js";

// Entry point for the whole fleet. One coarse cron calls this with no arguments;
// manual dispatch calls it with --job and --force.
//
//   npm run dispatch                        # everything due right now
//   npm run dispatch -- --list              # what exists, without running it
//   npm run dispatch -- --job game-night-poll --force --dry-run
//   npm run dispatch -- --now 2026-08-08T14:00:00 --dry-run

type Args = {
  job: string | null;
  force: boolean;
  forceRepost: boolean;
  dryRun: boolean;
  list: boolean;
  now: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    job: null,
    force: false,
    forceRepost: false,
    dryRun: false,
    list: false,
    now: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--job":
        args.job = argv[++index] ?? null;
        break;
      case "--now":
        args.now = argv[++index] ?? null;
        break;
      case "--force":
        args.force = true;
        break;
      case "--force-repost":
        args.forceRepost = true;
        args.force = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--list":
        args.list = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.dryRun) {
  process.env.EFFECTORS_DRY_RUN = "true";
}

if (args.list) {
  const config = { timezone: process.env.TIMEZONE ?? "America/New_York" };
  for (const job of allJobs) {
    const state = job.enabled ? "enabled" : "disabled";
    console.log(
      `${job.name}\t${state}\t${describeSchedule(job.schedule, config.timezone)}\t${job.channelEnv}`
    );
  }
  process.exit(0);
}

const config = loadRuntimeConfig();

// An explicit --now makes every schedule decision reproducible, which is the
// only sane way to test a biweekly gate without waiting two weeks.
const now = args.now
  ? DateTime.fromISO(args.now, { zone: config.timezone })
  : DateTime.now().setZone(config.timezone);

if (!now.isValid) {
  throw new Error(`Invalid --now value: ${args.now}`);
}

const selected = args.job ? [findJob(args.job)] : allJobs;

if (args.job && !selected[0]) {
  throw new Error(`Unknown job: ${args.job}. Known jobs: ${jobNames().join(", ")}`);
}

const state = await loadState();
const poster = createPoster(config.discordToken, config.dryRun);

let results: DispatchResult[] = [];
try {
  results = await dispatch({
    jobs: selected.filter((job) => job !== null),
    now,
    config,
    state,
    poster,
    force: args.force,
    forceRepost: args.forceRepost
  });
} finally {
  // Save even when a job threw: the beats explaining the failure are the point.
  if (!config.dryRun) {
    await saveState(state);
  }
}

for (const result of results) {
  logger.info("Effector result", result);
}

console.log(summarize(results));
process.exit(hasError(results) ? 1 : 0);
