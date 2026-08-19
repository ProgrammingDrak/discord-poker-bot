import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  CANNOT_MAKE_IT_LABEL,
  CAN_HOST_LABEL,
  buildGameNightPoll,
  getGameNightPollCloseTime,
  getNextGameNightWindow,
  isGameNightPostWindow,
  isGameNightWindowOnCadence
} from "../src/gameNight.js";

const timezone = "America/New_York";
const at = (iso: string) => DateTime.fromISO(iso, { zone: timezone });

describe("getNextGameNightWindow", () => {
  it("covers eight Wednesday-Saturday nights over two weeks from a Saturday post", () => {
    const window = getNextGameNightWindow(at("2026-08-08T14:00:00"), timezone);

    expect(window.windowStartISO).toBe("2026-08-12");
    expect(window.windowEndISO).toBe("2026-08-22");
    expect(window.optionLabels).toEqual([
      "Wednesday, August 12",
      "Thursday, August 13",
      "Friday, August 14",
      "Saturday, August 15",
      "Wednesday, August 19",
      "Thursday, August 20",
      "Friday, August 21",
      "Saturday, August 22"
    ]);
  });

  it("skips to the following Wednesday when posted on a Wednesday", () => {
    const window = getNextGameNightWindow(at("2026-08-12T14:00:00"), timezone);

    expect(window.windowStartISO).toBe("2026-08-19");
  });

  it("handles a year boundary", () => {
    const window = getNextGameNightWindow(at("2026-12-26T14:00:00"), timezone);

    expect(window.windowStartISO).toBe("2026-12-30");
    expect(window.windowEndISO).toBe("2027-01-09");
  });

  it("starts the day after the poll closes", () => {
    const post = at("2026-08-08T14:00:00");
    const close = getGameNightPollCloseTime(post, timezone);
    const window = getNextGameNightWindow(post, timezone);

    expect(close.toISO()).toBe(at("2026-08-11T14:00:00").toISO());
    expect(at(`${window.windowStartISO}T00:00:00`) > close).toBe(true);
  });
});

describe("isGameNightWindowOnCadence", () => {
  it("accepts the anchor window", () => {
    expect(isGameNightWindowOnCadence("2026-08-12", timezone)).toBe(true);
  });

  it("rejects the week between scheduled game nights", () => {
    expect(isGameNightWindowOnCadence("2026-08-19", timezone)).toBe(false);
  });

  it("accepts two weeks after the anchor", () => {
    expect(isGameNightWindowOnCadence("2026-08-26", timezone)).toBe(true);
  });

  it("holds the cadence across a DST change", () => {
    // EDT ends 2026-11-01, so this range spans the fall-back transition.
    expect(isGameNightWindowOnCadence("2026-11-04", timezone)).toBe(true);
    expect(isGameNightWindowOnCadence("2026-11-11", timezone)).toBe(false);
  });

  it("accepts windows before the anchor on the same parity", () => {
    expect(isGameNightWindowOnCadence("2026-07-29", timezone)).toBe(true);
    expect(isGameNightWindowOnCadence("2026-08-05", timezone)).toBe(false);
  });
});

describe("isGameNightPostWindow", () => {
  it("is true on Saturday at or after 2 PM", () => {
    expect(isGameNightPostWindow(at("2026-08-08T14:00:00"), timezone)).toBe(true);
    expect(isGameNightPostWindow(at("2026-08-08T19:30:00"), timezone)).toBe(true);
  });

  it("is false before 2 PM Saturday and on other days", () => {
    expect(isGameNightPostWindow(at("2026-08-08T13:59:00"), timezone)).toBe(false);
    expect(isGameNightPostWindow(at("2026-08-09T14:00:00"), timezone)).toBe(false);
  });
});

describe("buildGameNightPoll", () => {
  it("uses exactly ten answers: eight nights plus the two standing options", () => {
    const { body } = buildGameNightPoll(at("2026-08-08T14:00:00"), timezone);
    const labels = body.answers.map((answer) => answer.poll_media.text);

    expect(labels).toHaveLength(10);
    expect(labels.at(-2)).toBe(CANNOT_MAKE_IT_LABEL);
    expect(labels.at(-1)).toBe(CAN_HOST_LABEL);
    expect(new Set(labels).size).toBe(10);
  });

  it("stays within Discord's 55 character answer limit", () => {
    const { body } = buildGameNightPoll(at("2026-08-08T14:00:00"), timezone);

    for (const answer of body.answers) {
      expect(answer.poll_media.text.length).toBeLessThanOrEqual(55);
    }
  });

  it("allows multiselect and runs for 72 hours", () => {
    const { body } = buildGameNightPoll(at("2026-08-08T14:00:00"), timezone);

    expect(body.allow_multiselect).toBe(true);
    expect(body.duration).toBe(72);
  });

  it("reports a close time matching the poll duration", () => {
    const post = at("2026-08-08T14:00:00");
    const { closeAtISO } = buildGameNightPoll(post, timezone);

    expect(closeAtISO).toBe(post.plus({ hours: 72 }).toUTC().toISO());
  });
});
