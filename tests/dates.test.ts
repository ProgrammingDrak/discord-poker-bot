import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  getNextPokerWeek,
  getNextWeeklyRun,
  getPollCloseTime,
  getPollDurationHours,
  isPollPostWindow,
  reminderKeyForNow
} from "../src/dates.js";

const timezone = "America/New_York";
const at = (iso: string) => DateTime.fromISO(iso, { zone: timezone });

describe("getNextPokerWeek", () => {
  it("covers Thursday through Wednesday starting the Thursday after a Sunday post", () => {
    const week = getNextPokerWeek(at("2026-06-07T14:00:00"), timezone);

    expect(week.weekStartISO).toBe("2026-06-11");
    expect(week.weekEndISO).toBe("2026-06-17");
    expect(week.optionLabels).toEqual([
      "Thursday, June 11",
      "Friday, June 12",
      "Saturday, June 13",
      "Sunday, June 14",
      "Monday, June 15",
      "Tuesday, June 16",
      "Wednesday, June 17"
    ]);
  });

  it("handles a year boundary", () => {
    const week = getNextPokerWeek(at("2025-12-28T14:00:00"), timezone);

    expect(week.weekStartISO).toBe("2026-01-01");
    expect(week.weekEndISO).toBe("2026-01-07");
  });
});

describe("getPollCloseTime", () => {
  it("closes Wednesday 2 PM after a Sunday post", () => {
    const close = getPollCloseTime(at("2026-06-07T14:00:00"), timezone);

    expect(close.toISO()).toBe("2026-06-10T14:00:00.000-04:00");
  });
});

describe("getPollDurationHours", () => {
  it("is 72 hours from Sunday 2 PM to Wednesday 2 PM", () => {
    expect(getPollDurationHours(at("2026-06-07T14:00:00"), timezone)).toBe(72);
  });

  it("shrinks so a late post still closes near Wednesday 2 PM", () => {
    // Cron fired ~40 minutes late; duration rounds down toward the same close.
    expect(getPollDurationHours(at("2026-06-07T14:40:00"), timezone)).toBe(71);
  });
});

describe("getNextWeeklyRun", () => {
  it("schedules the current Sunday if 2 PM has not passed", () => {
    expect(getNextWeeklyRun(at("2026-06-07T09:00:00"), timezone).toISO()).toBe(
      "2026-06-07T14:00:00.000-04:00"
    );
  });

  it("schedules the following Sunday once 2 PM has passed", () => {
    expect(getNextWeeklyRun(at("2026-06-07T14:00:00"), timezone).toISO()).toBe(
      "2026-06-14T14:00:00.000-04:00"
    );
  });
});

describe("isPollPostWindow", () => {
  it("is true on Sunday at or after 2 PM", () => {
    expect(isPollPostWindow(at("2026-06-07T14:30:00"), timezone)).toBe(true);
  });

  it("is false on Sunday before 2 PM", () => {
    expect(isPollPostWindow(at("2026-06-07T13:00:00"), timezone)).toBe(false);
  });

  it("is false on other days", () => {
    expect(isPollPostWindow(at("2026-06-06T15:00:00"), timezone)).toBe(false);
  });
});

describe("reminderKeyForNow", () => {
  it("returns tuesday on Tuesday at or after noon", () => {
    expect(reminderKeyForNow(at("2026-06-09T12:30:00"), timezone)).toBe("tuesday");
  });

  it("returns wednesday on Wednesday at or after noon", () => {
    expect(reminderKeyForNow(at("2026-06-10T13:00:00"), timezone)).toBe("wednesday");
  });

  it("returns null before noon", () => {
    expect(reminderKeyForNow(at("2026-06-10T11:00:00"), timezone)).toBeNull();
  });

  it("returns null on a non-reminder day", () => {
    expect(reminderKeyForNow(at("2026-06-08T12:00:00"), timezone)).toBeNull();
  });
});
