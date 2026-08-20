import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { Job } from "../src/jobs/types.js";
import { RuntimeConfig, resetChannelCache } from "../src/runtime/config.js";
import { DiscordPoster, PostedMessage } from "../src/runtime/discord.js";
import { dispatch, hasError, summarize } from "../src/runtime/dispatcher.js";
import { EffectorsState, emptyState } from "../src/runtime/state.js";

const timezone = "America/New_York";
const at = (iso: string) => DateTime.fromISO(iso, { zone: timezone });
const SATURDAY_2PM = at("2026-08-08T14:00:00");

const config: RuntimeConfig = {
  discordToken: "token",
  guildId: "guild",
  timezone,
  dryRun: false,
  enforceSchedule: true
};

function poster(): DiscordPoster & { sent: number } {
  const fake = {
    sent: 0,
    async postPoll(input: { channelId: string }): Promise<PostedMessage> {
      fake.sent += 1;
      return { id: `msg-${fake.sent}`, channelId: input.channelId };
    },
    async postMessage(input: { channelId: string }): Promise<PostedMessage> {
      fake.sent += 1;
      return { id: `msg-${fake.sent}`, channelId: input.channelId };
    }
  };
  return fake;
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    name: "test-job",
    title: "Test Job",
    summary: "test",
    surface: "discord",
    channelEnv: "TEST_CHANNEL_ID",
    schedule: { weekday: 6, hour: 14 },
    enabled: true,
    dedupKey: () => "key-1",
    async run({ channelId, poster: p }) {
      const message = await p.postMessage({ channelId, content: "hello" });
      return { status: "posted", detail: "posted hello", message };
    },
    ...overrides
  };
}

let state: EffectorsState;

beforeEach(() => {
  state = emptyState();
  process.env.TEST_CHANNEL_ID = "channel-1";
  resetChannelCache();
});

afterEach(() => {
  delete process.env.TEST_CHANNEL_ID;
  delete process.env.EFFECTOR_CHANNELS;
  resetChannelCache();
});

describe("dispatch", () => {
  it("runs a due job and records the run and a beat", async () => {
    const p = poster();
    const results = await dispatch({
      jobs: [job()],
      now: SATURDAY_2PM,
      config,
      state,
      poster: p
    });

    expect(results[0]?.status).toBe("posted");
    expect(p.sent).toBe(1);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]).toMatchObject({ job: "test-job", dedupKey: "key-1", messageId: "msg-1" });
    expect(state.beats[0]).toMatchObject({ job: "test-job", status: "posted" });
  });

  it("does not post twice for the same dedup key", async () => {
    const p = poster();
    const options = { jobs: [job()], now: SATURDAY_2PM, config, state, poster: p };

    await dispatch(options);
    const second = await dispatch(options);

    expect(p.sent).toBe(1);
    expect(second[0]?.status).toBe("skipped");
    expect(second[0]?.detail).toMatch(/already ran/);
  });

  it("posts again for the same key only with force-repost", async () => {
    const p = poster();
    const base = { jobs: [job()], now: SATURDAY_2PM, config, state, poster: p };

    await dispatch(base);
    await dispatch({ ...base, forceRepost: true });

    expect(p.sent).toBe(2);
    expect(state.runs).toHaveLength(2);
  });

  it("skips a job that is out of its window, and force overrides that", async () => {
    const p = poster();
    const sunday = at("2026-08-09T14:00:00");

    const skipped = await dispatch({ jobs: [job()], now: sunday, config, state, poster: p });
    expect(skipped[0]?.status).toBe("skipped");
    expect(p.sent).toBe(0);

    const forced = await dispatch({
      jobs: [job()],
      now: sunday,
      config,
      state,
      poster: p,
      force: true
    });
    expect(forced[0]?.status).toBe("posted");
    expect(p.sent).toBe(1);
  });

  it("skips a disabled job even when it is due", async () => {
    const p = poster();
    const results = await dispatch({
      jobs: [job({ enabled: false })],
      now: SATURDAY_2PM,
      config,
      state,
      poster: p
    });

    expect(results[0]?.status).toBe("skipped");
    expect(results[0]?.detail).toMatch(/disabled/);
    expect(p.sent).toBe(0);
  });

  it("treats a due job with no configured channel as an error, not a quiet skip", async () => {
    delete process.env.TEST_CHANNEL_ID;
    resetChannelCache();
    const p = poster();

    const results = await dispatch({
      jobs: [job()],
      now: SATURDAY_2PM,
      config,
      state,
      poster: p
    });

    expect(results[0]?.status).toBe("error");
    expect(results[0]?.detail).toMatch(/TEST_CHANNEL_ID/);
    expect(hasError(results)).toBe(true);
  });

  it("reads a channel from the EFFECTOR_CHANNELS blob when no env var is set", async () => {
    delete process.env.TEST_CHANNEL_ID;
    process.env.EFFECTOR_CHANNELS = JSON.stringify({ TEST_CHANNEL_ID: "from-blob" });
    resetChannelCache();

    const p = poster();
    await dispatch({ jobs: [job()], now: SATURDAY_2PM, config, state, poster: p });

    expect(state.runs[0]?.channelId).toBe("from-blob");
  });

  // GitHub Actions renders an unset secret as an empty string rather than
  // omitting the variable, so the blob has to win over an empty env var. Getting
  // this wrong reports "channel not configured" while the right id sits in the
  // blob, and every hourly dispatch errors.
  it("does not let an empty env var shadow the EFFECTOR_CHANNELS blob", async () => {
    process.env.TEST_CHANNEL_ID = "";
    process.env.EFFECTOR_CHANNELS = JSON.stringify({ TEST_CHANNEL_ID: "from-blob" });
    resetChannelCache();

    const p = poster();
    const results = await dispatch({ jobs: [job()], now: SATURDAY_2PM, config, state, poster: p });

    expect(results[0]?.status).toBe("posted");
    expect(state.runs[0]?.channelId).toBe("from-blob");
  });

  it("keeps running the fleet when one job throws", async () => {
    const p = poster();
    const failing = job({
      name: "broken",
      dedupKey: () => "broken-1",
      async run() {
        throw new Error("discord said no");
      }
    });

    const results = await dispatch({
      jobs: [failing, job()],
      now: SATURDAY_2PM,
      config,
      state,
      poster: p
    });

    expect(results[0]).toMatchObject({ job: "broken", status: "error", detail: "discord said no" });
    expect(results[1]?.status).toBe("posted");
    expect(p.sent).toBe(1);
    expect(summarize(results)).toBe("posted 1, skipped 0, errored 1");
  });

  it("records a beat for every job, including the skips", async () => {
    const p = poster();
    await dispatch({
      jobs: [job({ name: "a" }), job({ name: "b", enabled: false })],
      now: SATURDAY_2PM,
      config,
      state,
      poster: p
    });

    expect(state.beats.map((beat) => `${beat.job}:${beat.status}`)).toEqual([
      "a:posted",
      "b:skipped"
    ]);
  });
});
