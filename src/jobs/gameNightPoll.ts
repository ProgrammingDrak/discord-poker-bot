import { DateTime } from "luxon";
import { buildPoll } from "../runtime/discord.js";
import { Schedule } from "../runtime/schedule.js";
import { Job, JobContext, JobOutcome } from "./types.js";

// Biweekly game night poll for the quest board channel.
//
// Lifecycle (all times America/New_York):
//   - Posts Saturday 2 PM, every other week.
//   - Offers the eight Wednesday-through-Saturday nights of the two weeks that
//     begin the first Wednesday after the post.
//   - Closes Tuesday 2 PM (72 hours), the day before the first candidate night.
//
// The every-other-week gate lives in the shared scheduler now, anchored on the
// post Saturday rather than the window Wednesday. Same parity, one fewer
// bespoke cadence implementation. `tests/gameNightPoll.test.ts` pins the two
// against each other so the migration cannot drift.

export const GAME_NIGHT_WINDOW_START_WEEKDAY = 3; // Wednesday
export const GAME_NIGHT_DURATION_HOURS = 72;
export const GAME_NIGHT_DAYS_PER_WEEK = 4; // Wednesday through Saturday
export const GAME_NIGHT_WEEKS = 2;

// Discord caps a poll at 10 answers. Eight dated nights plus these two is
// exactly 10, so neither list can grow without dropping something.
export const CANNOT_MAKE_IT_LABEL = "I can't make it";
export const CAN_HOST_LABEL = "I can host the nights I want to play";

export const GAME_NIGHT_QUESTION = "When can you make game night in the next two weeks?";
export const GAME_NIGHT_CONTENT =
  "@everyone Game night is every other week. Vote for every night you could show up. " +
  "Pick the host option too if you're willing to have people over on the nights you picked.";

export const GAME_NIGHT_SCHEDULE: Schedule = {
  weekday: 6, // Saturday
  hour: 14, // 2 PM, lower bound
  everyNWeeks: 2,
  // A Saturday that IS a game night post day. Shift this to move which week the
  // game night lands on.
  anchorISO: "2026-08-08"
};

export type GameNightWindow = {
  windowStartISO: string;
  windowEndISO: string;
  nightISODates: string[];
  optionLabels: string[];
};

// The eight Wednesday-Saturday nights across the two weeks beginning the first
// Wednesday strictly after `from`. Posting Saturday yields the Wednesday four
// days later, so the earliest night sits one day after the poll closes.
export function getNextGameNightWindow(from: DateTime, timezone: string): GameNightWindow {
  const local = from.setZone(timezone);
  const daysUntilWednesday = ((GAME_NIGHT_WINDOW_START_WEEKDAY - local.weekday + 7) % 7) || 7;
  const windowStart = local.plus({ days: daysUntilWednesday }).startOf("day");

  const nights: DateTime[] = [];
  for (let week = 0; week < GAME_NIGHT_WEEKS; week += 1) {
    for (let day = 0; day < GAME_NIGHT_DAYS_PER_WEEK; day += 1) {
      nights.push(windowStart.plus({ weeks: week, days: day }));
    }
  }

  return {
    windowStartISO: windowStart.toISODate() ?? "",
    windowEndISO: nights.at(-1)?.toISODate() ?? "",
    nightISODates: nights.map((night) => night.toISODate() ?? ""),
    optionLabels: nights.map((night) => night.toFormat("cccc, LLLL d"))
  };
}

export function getGameNightPollCloseTime(from: DateTime, timezone: string): DateTime {
  return from.setZone(timezone).plus({ hours: GAME_NIGHT_DURATION_HOURS });
}

export function buildGameNightPoll(now: DateTime, timezone: string) {
  const window = getNextGameNightWindow(now, timezone);
  const answers = [...window.optionLabels, CANNOT_MAKE_IT_LABEL, CAN_HOST_LABEL];

  return {
    window,
    closeAtISO: getGameNightPollCloseTime(now, timezone).toUTC().toISO() ?? "",
    body: buildPoll({
      question: GAME_NIGHT_QUESTION,
      answers,
      durationHours: GAME_NIGHT_DURATION_HOURS,
      allowMultiselect: true
    })
  };
}

export const gameNightPoll: Job = {
  name: "game-night-poll",
  title: "Game Night Poll",
  summary:
    "Biweekly availability poll for game night in the quest board channel. Eight candidate nights plus a can't-make-it and a can-host option.",
  surface: "discord",
  channelEnv: "QUEST_BOARD_CHANNEL_ID",
  schedule: GAME_NIGHT_SCHEDULE,
  enabled: true,

  // One poll per candidate window. Keyed on the window rather than the post date
  // so a manual dispatch and a late scheduled run on the same Saturday collapse
  // into one poll.
  dedupKey({ now, timezone }) {
    return getNextGameNightWindow(now, timezone).windowStartISO;
  },

  async run({ now, timezone, channelId, poster }: JobContext): Promise<JobOutcome> {
    const { body, window, closeAtISO } = buildGameNightPoll(now, timezone);

    const message = await poster.postPoll({
      channelId,
      content: GAME_NIGHT_CONTENT,
      mentionEveryone: true,
      poll: body
    });

    return {
      status: "posted",
      detail: `game night poll for ${window.windowStartISO} to ${window.windowEndISO}`,
      message,
      expectedCloseAt: closeAtISO,
      meta: {
        windowStart: window.windowStartISO,
        windowEnd: window.windowEndISO,
        nights: window.nightISODates,
        durationHours: body.duration
      }
    };
  }
};
