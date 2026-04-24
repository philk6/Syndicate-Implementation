/**
 * Time-tracking helpers shared between /my-time and /admin/employees.
 *
 * The business runs on America/Chicago time (CST/CDT). All timestamps live
 * in UTC in the DB; the pay-period math and all UI formatting convert
 * to/from Chicago time. When we eventually make the timezone configurable,
 * only BUSINESS_TZ moves.
 *
 * Pay-period rule: weekly, Monday 00:00 Chicago → Sunday 23:59:59.999
 * Chicago. A shift is counted under the Chicago calendar date that its
 * started_at falls on, even if it crosses midnight.
 */

export const BUSINESS_TZ = 'America/Chicago';

export const TASK_TYPES = [
  'prep',
  'shipping',
  'labeling',
  'receiving_order',
  'receiving_general',
  'cleaning',
  'break',
  'other',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_LABELS: Record<TaskType, string> = {
  prep: 'Prep',
  shipping: 'Shipping',
  labeling: 'Labeling',
  receiving_order: 'Receiving (for order)',
  receiving_general: 'Receiving (general)',
  cleaning: 'Cleaning',
  break: 'Break',
  other: 'Other',
};

/** Tasks that require an order_id tag. Enforced in the application layer. */
export const TASKS_REQUIRING_ORDER: ReadonlyArray<TaskType> = [
  'prep',
  'shipping',
  'labeling',
  'receiving_order',
];

// ─── Timezone helpers (no external deps) ───────────────────────────────────

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;
  second: number;
  /** 1 = Monday, 7 = Sunday (ISO). */
  weekday: number;
}

/** Decompose a UTC Date into year/month/day/... as observed in `tz`. */
export function toZoned(ts: Date, tz: string = BUSINESS_TZ): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(ts);
  const read = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year:   Number(read('year')),
    month:  Number(read('month')),
    day:    Number(read('day')),
    hour:   Number(read('hour')) === 24 ? 0 : Number(read('hour')),
    minute: Number(read('minute')),
    second: Number(read('second')),
    weekday: weekdayMap[read('weekday')] ?? 1,
  };
}

/**
 * Build a UTC Date that corresponds to the given local wall-clock time in
 * `tz`. Uses a 2-pass correction because tz offsets are discovered by
 * formatting a guess back into the zone (DST-safe).
 */
export function zonedWallClockToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  tz: string = BUSINESS_TZ,
): Date {
  // First pass: pretend the wall-clock time is UTC.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  // Measure what the tz thinks that UTC instant looks like — the delta
  // between the guess and that value equals the tz offset at that moment.
  const z = toZoned(new Date(guess), tz);
  const zMs = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  const offsetMs = zMs - guess; // positive when tz is ahead of UTC
  return new Date(guess - offsetMs);
}

/**
 * Most recent Monday 00:00:00 in the business timezone, as a UTC Date.
 * If `ts` is already Monday 00:00 Chicago, returns that same instant.
 */
export function payPeriodStart(ts: Date = new Date(), tz: string = BUSINESS_TZ): Date {
  const z = toZoned(ts, tz);
  // Move back (weekday-1) days to land on Monday.
  const daysBack = z.weekday - 1; // Monday → 0, Sunday → 6
  const mondayUtcMidnightGuess = zonedWallClockToUtc(z.year, z.month, z.day, 0, 0, 0, tz);
  // The guess is THIS weekday's midnight. Subtract daysBack days for Monday.
  return new Date(mondayUtcMidnightGuess.getTime() - daysBack * 24 * 60 * 60 * 1000);
}

/** End of current pay period — Sunday 23:59:59.999 business time, UTC. */
export function payPeriodEnd(ts: Date = new Date(), tz: string = BUSINESS_TZ): Date {
  const start = payPeriodStart(ts, tz);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

/** Returns [start, end) UTC Date pair for the pay period containing `ts`. */
export function payPeriodRange(ts: Date = new Date(), tz: string = BUSINESS_TZ): [Date, Date] {
  const start = payPeriodStart(ts, tz);
  return [start, new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)];
}

/** Chicago-local YYYY-MM-DD key for grouping entries by business date. */
export function businessDateKey(ts: Date, tz: string = BUSINESS_TZ): string {
  const z = toZoned(ts, tz);
  return `${z.year.toString().padStart(4, '0')}-${z.month.toString().padStart(2, '0')}-${z.day
    .toString()
    .padStart(2, '0')}`;
}

// ─── Display helpers ───────────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export function hoursBetween(start: Date, end: Date | null): number {
  const e = end ?? new Date();
  return Math.max(0, (e.getTime() - start.getTime()) / (1000 * 60 * 60));
}

/** Formatter for a time-of-day in business tz: "9:24 AM". */
export function formatZonedTime(ts: Date, tz: string = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(ts);
}

/** Formatter for a date in business tz: "Mon, Apr 22". */
export function formatZonedDate(ts: Date, tz: string = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
  }).format(ts);
}
