// UTC-safe date-only arithmetic for the regulatory engines.
//
// Pharmaceutical dates (expiry, manufacturing, arrival) are date-only facts.
// Library functions that operate in local time shift results across DST
// boundaries — unacceptable for compliance math — so the engines use these
// UTC-component utilities exclusively.

const DAY_MS = 86_400_000;

/** Truncates to the UTC calendar date (midnight UTC). */
export function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDaysUtc(d: Date, days: number): Date {
  return new Date(utcDateOnly(d).getTime() + days * DAY_MS);
}

/** Month addition with end-of-month clamping (Jan 31 + 1 → Feb 28/29). */
export function addMonthsUtc(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const targetFirst = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(day, lastDay)));
}

/** Whole calendar days from `from` until `until` (negative when past). */
export function diffDaysUtc(until: Date, from: Date): number {
  return Math.round((utcDateOnly(until).getTime() - utcDateOnly(from).getTime()) / DAY_MS);
}

/** Full calendar months from `from` until `until` (floor; negative when past). */
export function diffMonthsUtc(until: Date, from: Date): number {
  const u = utcDateOnly(until);
  const f = utcDateOnly(from);
  let months = (u.getUTCFullYear() - f.getUTCFullYear()) * 12 + (u.getUTCMonth() - f.getUTCMonth());
  if (addMonthsUtc(f, months).getTime() > u.getTime()) months -= 1;
  return months;
}
