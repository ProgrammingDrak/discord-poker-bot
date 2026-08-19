import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  CANNOT_MAKE_IT_LABEL,
  CAN_HOST_LABEL,
  buildGameNightPoll,
  gameNightPoll,
  getGameNightPollCloseTime,
  getNextGameNightWindow
} from "../src/jobs/gameNightPoll.js";
import { PollBody, PostedMessage } from "../src/runtime/discord.js";

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
    expect(getNextGameNightWindow(at("2026-08-12T14:00:00"), timezone).windowStartISO).toBe(
      "2026-08-19"
    );
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

describe("gameNightPoll job", () => {
  it("dedups on the candidate window, not the post date", () => {
    // A poll posted Saturday and a forced re-run later the same weekend target
    // the same window, so they must collapse to one key.
    const saturday = gameNightPoll.dedupKey({ now: at("2026-08-08T14:00:00"), timezone });
    const sunday = gameNightPoll.dedupKey({ now: at("2026-08-09T09:00:00"), timezone });

    expect(saturday).toBe("2026-08-12");
    expect(sunday).toBe("2026-08-12");
  });

  it("posts one @everyone poll to the configured channel", async () => {
    const sent: Array<{ channelId: string; content: string; poll: PollBody }> = [];
    const poster = {
      async postPoll(input: {
        channelId: string;
        content: string;
        mentionEveryone?: boolean;
        poll: PollBody;
      }): Promise<PostedMessage> {
        sent.push({ channelId: input.channelId, content: input.content, poll: input.poll });
        expect(input.mentionEveryone).toBe(true);
        return { id: "msg-1", channelId: input.channelId };
      },
      async postMessage(): Promise<PostedMessage> {
        throw new Error("game night should post a poll, not a plain message");
      }
    };

    const outcome = await gameNightPoll.run({
      now: at("2026-08-08T14:00:00"),
      timezone,
      channelId: "quest-board",
      poster
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.channelId).toBe("quest-board");
    expect(outcome.status).toBe("posted");

    if (outcome.status === "posted") {
      expect(outcome.message.id).toBe("msg-1");
      expect(outcome.meta?.windowStart).toBe("2026-08-12");
    }
  });
});
