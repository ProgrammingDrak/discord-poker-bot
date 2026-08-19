import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { evaluateSchedule, isOnCadence, isPostWindow } from "../src/runtime/schedule.js";
import { GAME_NIGHT_SCHEDULE, getNextGameNightWindow } from "../src/jobs/gameNightPoll.js";

const timezone = "America/New_York";
const at = (iso: string) => DateTime.fromISO(iso, { zone: timezone });

const weekly = { weekday: 6, hour: 14 };

describe("isPostWindow", () => {
  it("is true on the target weekday at or after the hour", () => {
    expect(isPostWindow(weekly, at("2026-08-08T14:00:00"), timezone)).toBe(true);
    expect(isPostWindow(weekly, at("2026-08-08T23:30:00"), timezone)).toBe(true);
  });

  it("is false before the hour and on other days", () => {
    expect(isPostWindow(weekly, at("2026-08-08T13:59:00"), timezone)).toBe(false);
    expect(isPostWindow(weekly, at("2026-08-09T14:00:00"), timezone)).toBe(false);
  });

  it("reads the hour in the job's timezone, not UTC", () => {
    // 2026-08-08T18:30Z is 2:30 PM EDT on the Saturday: in window locally even
    // though UTC has already moved past the hour on a different reckoning.
    const utc = DateTime.fromISO("2026-08-08T18:30:00", { zone: "utc" });
    expect(isPostWindow(weekly, utc, timezone)).toBe(true);
  });
});

describe("isOnCadence", () => {
  it("treats a weekly schedule as always on cadence", () => {
    expect(isOnCadence(weekly, at("2026-08-15T14:00:00"), timezone)).toBe(true);
  });

  it("accepts the anchor and every second week after it", () => {
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-08-08T14:00:00"), timezone)).toBe(true);
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-08-15T14:00:00"), timezone)).toBe(false);
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-08-22T14:00:00"), timezone)).toBe(true);
  });

  it("holds parity across the fall DST change", () => {
    // EDT ends 2026-11-01, so this pair spans the transition.
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-10-31T14:00:00"), timezone)).toBe(true);
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-11-07T14:00:00"), timezone)).toBe(false);
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-11-14T14:00:00"), timezone)).toBe(true);
  });

  it("counts backwards from the anchor too", () => {
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-07-25T14:00:00"), timezone)).toBe(true);
    expect(isOnCadence(GAME_NIGHT_SCHEDULE, at("2026-08-01T14:00:00"), timezone)).toBe(false);
  });

  it("rejects an anchor that is not on the scheduled weekday", () => {
    expect(() =>
      isOnCadence(
        { weekday: 6, hour: 14, everyNWeeks: 2, anchorISO: "2026-08-12" },
        at("2026-08-08T14:00:00"),
        timezone
      )
    ).toThrow(/weekday/);
  });
});

// The retired game night module gated the cadence on the poll's WINDOW start
// (a Wednesday); the shared scheduler gates on the POST day (the Saturday).
// They must select the same Saturdays or the migration silently shifted which
// week game night lands on.
describe("cadence parity with the retired window-based implementation", () => {
  const LEGACY_ANCHOR_WINDOW_START = "2026-08-12";

  function legacyIsWindowOnCadence(windowStartISO: string): boolean {
    const windowStart = DateTime.fromISO(windowStartISO, { zone: timezone }).startOf("day");
    const anchor = DateTime.fromISO(LEGACY_ANCHOR_WINDOW_START, { zone: timezone }).startOf("day");
    const weeks = Math.round(windowStart.diff(anchor, "weeks").weeks);
    return Math.abs(weeks) % 2 === 0;
  }

  it("agrees on every Saturday for a year", () => {
    let saturday = at("2026-08-08T14:00:00");
    const disagreements: string[] = [];

    for (let week = 0; week < 52; week += 1) {
      const legacy = legacyIsWindowOnCadence(
        getNextGameNightWindow(saturday, timezone).windowStartISO
      );
      const current = isOnCadence(GAME_NIGHT_SCHEDULE, saturday, timezone);

      if (legacy !== current) {
        disagreements.push(`${saturday.toISODate()}: legacy=${legacy} current=${current}`);
      }

      saturday = saturday.plus({ weeks: 1 });
    }

    expect(disagreements).toEqual([]);
  });
});

describe("evaluateSchedule", () => {
  it("reports a manual-only job as not due, with a reason", () => {
    const decision = evaluateSchedule(null, at("2026-08-08T14:00:00"), timezone);
    expect(decision.due).toBe(false);
    expect(decision.reason).toMatch(/manual/);
  });

  it("distinguishes an off week from an out-of-window time", () => {
    expect(evaluateSchedule(GAME_NIGHT_SCHEDULE, at("2026-08-15T14:00:00"), timezone)).toEqual({
      due: false,
      reason: "off week for every-2-weeks cadence"
    });

    expect(
      evaluateSchedule(GAME_NIGHT_SCHEDULE, at("2026-08-08T09:00:00"), timezone).reason
    ).toMatch(/outside post window/);
  });

  it("is due in window and on cadence", () => {
    expect(evaluateSchedule(GAME_NIGHT_SCHEDULE, at("2026-08-08T14:00:00"), timezone).due).toBe(
      true
    );
  });
});
