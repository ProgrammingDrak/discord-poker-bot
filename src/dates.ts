import { DateTime } from "luxon";

// Poll lifecycle (all times America/New_York):
//   - Posts Sunday 2 PM, options cover the Thursday-through-Wednesday play week
//     that begins the Thursday right after the poll closes.
//   - Reminders post Tuesday 12 PM and Wednesday 12 PM.
//   - Closes Wednesday 2 PM (Discord native poll expiry).
// Luxon weekday: Monday = 1 ... Thursday = 4, Sunday = 7.

export const POLL_POST_WEEKDAY = 7; // Sunday
export const POLL_POST_HOUR = 14; // 2 PM
export const PLAY_WEEK_START_WEEKDAY = 4; // Thursday
export const POLL_CLOSE_WEEKDAY = 3; // Wednesday
export const POLL_CLOSE_HOUR = 14; // 2 PM
export const REMINDER_HOUR = 12; // 12 PM

export type ReminderKey = "tuesday" | "wednesday";

const REMINDER_WEEKDAYS: Record<ReminderKey, number> = {
  tuesday: 2,
  wednesday: 3
};

export type PokerWeek = {
  weekStartISO: string;
  weekEndISO: string;
  optionLabels: string[];
};

// The Thursday-through-Wednesday play week beginning the first Thursday strictly
// after `from`. Posting on Sunday yields the Thursday four days later.
export function getNextPokerWeek(from: DateTime, timezone: string): PokerWeek {
  const local = from.setZone(timezone);
  const daysUntilThursday = ((PLAY_WEEK_START_WEEKDAY - local.weekday + 7) % 7) || 7;
  const weekStart = local.plus({ days: daysUntilThursday }).startOf("day");
  const optionLabels = Array.from({ length: 7 }, (_, index) =>
    weekStart.plus({ days: index }).toFormat("cccc, LLLL d")
  );

  return {
    weekStartISO: weekStart.toISODate() ?? "",
    weekEndISO: weekStart.plus({ days: 6 }).toISODate() ?? "",
    optionLabels
  };
}

// Wednesday 2 PM strictly after `from` (the post time). The poll's Discord
// duration is derived from this so the close lands on Wednesday 2 PM regardless
// of how late GitHub's scheduler actually fires the post.
export function getPollCloseTime(from: DateTime, timezone: string): DateTime {
  const local = from.setZone(timezone);
  const daysUntilWednesday = ((POLL_CLOSE_WEEKDAY - local.weekday + 7) % 7) || 7;
  return local
    .plus({ days: daysUntilWednesday })
    .set({ hour: POLL_CLOSE_HOUR, minute: 0, second: 0, millisecond: 0 });
}

// Whole hours from `from` to the poll close. Discord poll duration is an integer
// number of hours, so this rounds to the nearest hour.
export function getPollDurationHours(from: DateTime, timezone: string): number {
  const close = getPollCloseTime(from, timezone);
  const hours = close.diff(from, "hours").hours;
  return Math.max(1, Math.round(hours));
}

export function getNextWeeklyRun(after: DateTime, timezone: string): DateTime {
  const local = after.setZone(timezone);
  let candidate = local.set({
    weekday: POLL_POST_WEEKDAY,
    hour: POLL_POST_HOUR,
    minute: 0,
    second: 0,
    millisecond: 0
  });

  if (candidate <= local) {
    candidate = candidate.plus({ weeks: 1 });
  }

  return candidate;
}

export function millisUntil(target: DateTime, from = DateTime.now()): number {
  return Math.max(0, Math.ceil(target.toUTC().diff(from.toUTC(), "milliseconds").milliseconds));
}

// True once it is Sunday on or after 2 PM ET. Deliberately a lower bound rather
// than an exact hour: GitHub Actions cron routinely fires 15-60+ minutes late,
// and per-week dedup (issue state) keeps repeated Sunday runs idempotent.
export function isPollPostWindow(now: DateTime, timezone: string): boolean {
  const local = now.setZone(timezone);
  return local.weekday === POLL_POST_WEEKDAY && local.hour >= POLL_POST_HOUR;
}

// Which reminder, if any, the current moment belongs to: Tuesday or Wednesday
// on or after 12 PM ET. Same lower-bound approach as the post window.
export function reminderKeyForNow(now: DateTime, timezone: string): ReminderKey | null {
  const local = now.setZone(timezone);
  if (local.hour < REMINDER_HOUR) {
    return null;
  }
  if (local.weekday === REMINDER_WEEKDAYS.tuesday) {
    return "tuesday";
  }
  if (local.weekday === REMINDER_WEEKDAYS.wednesday) {
    return "wednesday";
  }
  return null;
}
