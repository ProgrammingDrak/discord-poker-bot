import { DateTime } from "luxon";

// Generic schedule gating for effectors.
//
// GitHub Actions cron is UTC-only, fires 15-60+ minutes late, and cannot express
// "every other week". Every job used to re-solve all three problems by hand.
// This module solves them once:
//
//   - Jobs declare a local weekday + hour in their own timezone.
//   - The hour is a LOWER BOUND, not an exact match, so a late cron still fires.
//     Per-run dedup (see state.ts) is what keeps repeated firings idempotent, so
//     a loose gate is safe and an exact gate would simply miss.
//   - `everyNWeeks` counts whole weeks from a fixed anchor date rather than
//     tracking a "last run" counter, so parity survives a skipped or replayed
//     run, a DST shift, and a year boundary.
//
// Luxon weekday: Monday = 1 ... Sunday = 7.

export type Schedule = {
  weekday: number;
  hour: number;
  // Omit for weekly. 2 = every other week, counted from `anchorISO`.
  everyNWeeks?: number;
  // A date that IS on cadence. Must fall on `weekday`. Required when everyNWeeks
  // is set.
  anchorISO?: string;
};

export type ScheduleDecision = {
  due: boolean;
  reason: string;
};

export function isPostWindow(schedule: Schedule, now: DateTime, timezone: string): boolean {
  const local = now.setZone(timezone);
  return local.weekday === schedule.weekday && local.hour >= schedule.hour;
}

// True when `now` falls on the every-N-weeks cadence measured from the anchor.
export function isOnCadence(schedule: Schedule, now: DateTime, timezone: string): boolean {
  const everyNWeeks = schedule.everyNWeeks ?? 1;
  if (everyNWeeks <= 1) {
    return true;
  }

  if (!schedule.anchorISO) {
    throw new Error("Schedule sets everyNWeeks but no anchorISO to count weeks from");
  }

  const local = now.setZone(timezone).startOf("day");
  const anchor = DateTime.fromISO(schedule.anchorISO, { zone: timezone }).startOf("day");

  if (!local.isValid || !anchor.isValid) {
    throw new Error(`Invalid cadence anchor: ${schedule.anchorISO}`);
  }

  if (anchor.weekday !== schedule.weekday) {
    throw new Error(
      `Cadence anchor ${schedule.anchorISO} is weekday ${anchor.weekday}, expected ${schedule.weekday}`
    );
  }

  const weeks = Math.round(local.diff(anchor, "weeks").weeks);
  return Math.abs(weeks) % everyNWeeks === 0;
}

// The full gate a scheduled job passes through. Returns a reason either way so
// the dispatcher can log why a job did not run, which is the difference between
// "off week, working as intended" and "broken".
export function evaluateSchedule(
  schedule: Schedule | null,
  now: DateTime,
  timezone: string
): ScheduleDecision {
  if (!schedule) {
    return { due: false, reason: "manual-only job, no schedule" };
  }

  const local = now.setZone(timezone);

  if (!isPostWindow(schedule, now, timezone)) {
    return {
      due: false,
      reason: `outside post window (want weekday ${schedule.weekday} at or after ${schedule.hour}:00, now is weekday ${local.weekday} at ${local.hour}:00)`
    };
  }

  if (!isOnCadence(schedule, now, timezone)) {
    return { due: false, reason: `off week for every-${schedule.everyNWeeks}-weeks cadence` };
  }

  return { due: true, reason: "in window and on cadence" };
}

export function describeSchedule(schedule: Schedule | null, timezone: string): string {
  if (!schedule) {
    return "manual dispatch only";
  }

  const weekdayName = DateTime.fromObject({ weekday: schedule.weekday as 1 }).toFormat("cccc");
  const time = DateTime.fromObject({ hour: schedule.hour, minute: 0 }).toFormat("h a");
  const cadence =
    (schedule.everyNWeeks ?? 1) > 1 ? `every ${schedule.everyNWeeks} weeks` : "weekly";

  return `${cadence}, ${weekdayName} ${time} ${timezone}`;
}
