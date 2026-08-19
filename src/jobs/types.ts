import { DateTime } from "luxon";
import { DiscordPoster, PostedMessage } from "../runtime/discord.js";
import { Schedule } from "../runtime/schedule.js";

export type JobContext = {
  now: DateTime;
  timezone: string;
  channelId: string;
  poster: DiscordPoster;
};

export type JobOutcome =
  | {
      status: "posted";
      detail: string;
      message: PostedMessage;
      expectedCloseAt?: string | null;
      meta?: Record<string, unknown>;
    }
  | { status: "skipped"; detail: string };

export type Job = {
  // Stable id. Used on the command line, in the workflow input, as the dedup
  // namespace, and as the key the brain's catalog joins on. Do not rename one
  // without migrating the state issue.
  name: string;
  title: string;
  summary: string;
  surface: "discord";
  // Name of the env var holding this job's channel id. Resolved per job so one
  // unconfigured channel cannot block the rest of the fleet.
  channelEnv: string;
  schedule: Schedule | null;
  enabled: boolean;
  // Computed BEFORE run() so the dispatcher can decide "already done" without
  // the job having to post first and check afterwards.
  dedupKey(context: Omit<JobContext, "poster" | "channelId">): string;
  run(context: JobContext): Promise<JobOutcome>;
};

export type JobDescriptor = {
  name: string;
  title: string;
  summary: string;
  surface: string;
  channelEnv: string;
  enabled: boolean;
  schedule: string;
};

export function describeJob(job: Job, scheduleText: string): JobDescriptor {
  return {
    name: job.name,
    title: job.title,
    summary: job.summary,
    surface: job.surface,
    channelEnv: job.channelEnv,
    enabled: job.enabled,
    schedule: scheduleText
  };
}
