import { describe, expect, it } from "vitest";
import { emptyState, findRun, parseState, recordRun } from "../src/runtime/state.js";

const wrap = (marker: string, payload: unknown) =>
  ["State", "", marker, JSON.stringify(payload, null, 2), "-->"].join("\n");

describe("parseState", () => {
  it("returns an empty state for a body with no marker", () => {
    expect(parseState("just some text")).toEqual({ runs: [], beats: [], legacy: {} });
  });

  it("reads runs and beats back out of the current format", () => {
    const body = wrap("<!-- effectors-state", {
      runs: [{ job: "game-night-poll", dedupKey: "2026-08-12", ranAt: "2026-08-08T18:00:00Z" }],
      beats: [
        {
          job: "game-night-poll",
          status: "posted",
          at: "2026-08-08T18:00:00Z",
          durationMs: 900,
          detail: "ok"
        }
      ],
      legacy: { polls: [] }
    });

    const state = parseState(body);
    expect(state.runs).toHaveLength(1);
    expect(state.beats[0]?.status).toBe("posted");
    expect(state.legacy).toEqual({ polls: [] });
  });

  // The controller inherits the retired poker bot's issue. Its payload has to
  // survive the schema change: it is the only record of what that bot posted.
  it("adopts the retired poker bot's payload as legacy", () => {
    const body = wrap("<!-- boredom-bot-state", {
      polls: [{ messageId: "1", channelId: "2", weekStart: "2026-08-13" }]
    });

    const state = parseState(body);
    expect(state.runs).toEqual([]);
    expect(state.legacy).toEqual({
      polls: [{ messageId: "1", channelId: "2", weekStart: "2026-08-13" }]
    });
  });

  it("prefers the current format when both markers are present", () => {
    const body = [
      wrap("<!-- boredom-bot-state", { polls: [{ messageId: "old" }] }),
      wrap("<!-- effectors-state", { runs: [{ job: "j", dedupKey: "k", ranAt: "t" }], beats: [] })
    ].join("\n");

    const state = parseState(body);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]?.job).toBe("j");
  });

  // Silently resetting to empty would make every job think it had never run and
  // re-post the whole fleet.
  it("throws on a corrupt payload rather than resetting to empty", () => {
    const body = ["<!-- effectors-state", "{ not json", "-->"].join("\n");
    expect(() => parseState(body)).toThrow(/not valid JSON/);
  });
});

describe("findRun", () => {
  it("matches on job and key together", () => {
    const state = emptyState();
    recordRun(state, { job: "a", dedupKey: "1", ranAt: "t" });

    expect(findRun(state, "a", "1")).not.toBeNull();
    expect(findRun(state, "a", "2")).toBeNull();
    expect(findRun(state, "b", "1")).toBeNull();
  });
});
