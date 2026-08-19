import { DateTime } from "luxon";

// Game night poll lifecycle (all times America/New_York):
//   - Posts Saturday 2 PM in the quest board channel.
//   - Offers the eight Wednesday-through-Saturday nights of the two weeks that
//     begin the first Wednesday after the post.
//   - Closes Tuesday 2 PM (72 hours), one day before the first candidate night.
//   - Runs every other Saturday. GitHub cron cannot express "biweekly", so the
//     workflow fires weekly and this module gates on window parity against a
//     fixed anchor Wednesday.
//
// Luxon weekday: Monday = 1 ... Wednesday = 3, Saturday = 6.

export const GAME_NIGHT_POST_WEEKDAY = 6; // Saturday
export const GAME_NIGHT_POST_HOUR = 14; // 2 PM
export const GAME_NIGHT_WINDOW_START_WEEKDAY = 3; // Wednesday
export const GAME_NIGHT_DURATION_HOURS = 72; // 3 days

// Nights offered inside each week of the window: Wednesday through Saturday.
export const GAME_NIGHT_DAYS_PER_WEEK = 4;
export const GAME_NIGHT_WEEKS = 2;

// Every candidate window start is a Wednesday. A window is "on cadence" when an
// even number of weeks separates it from this anchor, which keeps the every-two-
// weeks rhythm stable even if a run is skipped or replayed.
export const GAME_NIGHT_ANCHOR_WINDOW_START = "2026-08-12"; // Wednesday

// Discord caps a poll at 10 answers. Eight dated nights plus these two is
// exactly 10, so neither list can grow without dropping something.
export const CANNOT_MAKE_IT_LABEL = "I can't make it";
export const CAN_HOST_LABEL = "I can host the nights I want to play";

export const GAME_NIGHT_QUESTION = "When can you make game night in the next two weeks?";
export const GAME_NIGHT_CONTENT =
  "@everyone Game night is every other week. Vote for every night you could show up. " +
  "Pick the host option too if you're willing to have people over on the nights you picked.";

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

// True when `windowStartISO` lands on the every-other-week cadence. Weeks are
// counted from the anchor Wednesday, so the parity holds across DST shifts and
// year boundaries.
export function isGameNightWindowOnCadence(
  windowStartISO: string,
  timezone: string,
  anchorISO = GAME_NIGHT_ANCHOR_WINDOW_START
): boolean {
  const windowStart = DateTime.fromISO(windowStartISO, { zone: timezone }).startOf("day");
  const anchor = DateTime.fromISO(anchorISO, { zone: timezone }).startOf("day");

  if (!windowStart.isValid || !anchor.isValid) {
    return false;
  }

  const weeks = Math.round(windowStart.diff(anchor, "weeks").weeks);
  return Math.abs(weeks) % 2 === 0;
}

// Saturday 2 PM ET, lower bound rather than an exact hour: GitHub Actions cron
// routinely fires 15-60+ minutes late, and window dedup keeps replays idempotent.
export function isGameNightPostWindow(now: DateTime, timezone: string): boolean {
  const local = now.setZone(timezone);
  return local.weekday === GAME_NIGHT_POST_WEEKDAY && local.hour >= GAME_NIGHT_POST_HOUR;
}

// Tuesday 2 PM strictly after the post: 72 hours later, the day before the
// first candidate night.
export function getGameNightPollCloseTime(from: DateTime, timezone: string): DateTime {
  return from.setZone(timezone).plus({ hours: GAME_NIGHT_DURATION_HOURS });
}

export type GameNightPollBody = {
  question: { text: string };
  answers: Array<{ poll_media: { text: string } }>;
  duration: number;
  allow_multiselect: boolean;
  layout_type: number;
};

export function buildGameNightPoll(
  now: DateTime,
  timezone: string
): {
  body: GameNightPollBody;
  window: GameNightWindow;
  closeAtISO: string;
} {
  const window = getNextGameNightWindow(now, timezone);
  const labels = [...window.optionLabels, CANNOT_MAKE_IT_LABEL, CAN_HOST_LABEL];

  if (labels.length > 10) {
    throw new Error(`Discord allows at most 10 poll answers, got ${labels.length}`);
  }

  return {
    window,
    closeAtISO: getGameNightPollCloseTime(now, timezone).toUTC().toISO() ?? "",
    body: {
      question: { text: GAME_NIGHT_QUESTION },
      answers: labels.map((text) => ({ poll_media: { text } })),
      duration: GAME_NIGHT_DURATION_HOURS,
      allow_multiselect: true,
      layout_type: 1
    }
  };
}
