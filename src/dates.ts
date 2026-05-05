import { DateTime } from "luxon";

export const POKER_POLL_DURATION_HOURS = 48;
export const WEEKLY_POLL_WEEKDAY = 7;
export const WEEKLY_POLL_HOUR = 10;

export type PokerWeek = {
  weekStartISO: string;
  weekEndISO: string;
  optionLabels: string[];
};

export function getNextPokerWeek(from: DateTime, timezone: string): PokerWeek {
  const local = from.setZone(timezone);
  const daysUntilNextMonday = ((8 - local.weekday) % 7) || 7;
  const weekStart = local.plus({ days: daysUntilNextMonday }).startOf("day");
  const optionLabels = Array.from({ length: 7 }, (_, index) =>
    weekStart.plus({ days: index }).toFormat("cccc, LLLL d")
  );

  return {
    weekStartISO: weekStart.toISODate() ?? "",
    weekEndISO: weekStart.plus({ days: 6 }).toISODate() ?? "",
    optionLabels
  };
}

export function getNextWeeklyRun(after: DateTime, timezone: string): DateTime {
  const local = after.setZone(timezone);
  let candidate = local.set({
    weekday: WEEKLY_POLL_WEEKDAY,
    hour: WEEKLY_POLL_HOUR,
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
