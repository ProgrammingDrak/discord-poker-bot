import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { getNextPokerWeek, getNextWeeklyRun } from "../src/dates.js";

const timezone = "America/New_York";

describe("getNextPokerWeek", () => {
  it("uses the next Monday through Sunday for a normal midweek date", () => {
    const week = getNextPokerWeek(DateTime.fromISO("2026-05-05T12:00:00", { zone: timezone }), timezone);

    expect(week.weekStartISO).toBe("2026-05-11");
    expect(week.weekEndISO).toBe("2026-05-17");
    expect(week.optionLabels).toEqual([
      "Monday, May 11",
      "Tuesday, May 12",
      "Wednesday, May 13",
      "Thursday, May 14",
      "Friday, May 15",
      "Saturday, May 16",
      "Sunday, May 17"
    ]);
  });

  it("handles a year boundary", () => {
    const week = getNextPokerWeek(DateTime.fromISO("2025-12-28T10:00:00", { zone: timezone }), timezone);

    expect(week.weekStartISO).toBe("2025-12-29");
    expect(week.weekEndISO).toBe("2026-01-04");
  });

  it("keeps the poker week stable across daylight saving time start", () => {
    const week = getNextPokerWeek(DateTime.fromISO("2026-03-07T12:00:00", { zone: timezone }), timezone);

    expect(week.weekStartISO).toBe("2026-03-09");
    expect(week.weekEndISO).toBe("2026-03-15");
  });
});

describe("getNextWeeklyRun", () => {
  it("schedules the current Sunday if 10 AM has not passed", () => {
    const run = getNextWeeklyRun(DateTime.fromISO("2026-05-10T09:00:00", { zone: timezone }), timezone);

    expect(run.toISO()).toBe("2026-05-10T10:00:00.000-04:00");
  });

  it("schedules the following Sunday after the weekly time has passed", () => {
    const run = getNextWeeklyRun(DateTime.fromISO("2026-05-10T10:00:00", { zone: timezone }), timezone);

    expect(run.toISO()).toBe("2026-05-17T10:00:00.000-04:00");
  });

  it("keeps the wall-clock time at 10 AM across daylight saving time", () => {
    const run = getNextWeeklyRun(DateTime.fromISO("2026-03-07T12:00:00", { zone: timezone }), timezone);

    expect(run.toISO()).toBe("2026-03-08T10:00:00.000-04:00");
  });
});
