/**
 * How the Analytics view writes a number, a share and a time (issue 521). Pure; unit-tested in format.test.ts. English only, like the rest of the admin.
 */

const numbers = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export const formatCount = (value: number | null | undefined): string => (value === null || value === undefined || !Number.isFinite(value) ? 'n/a' : numbers.format(value));

/** A share of a whole as a whole percent ("33 %"); "n/a" when there is no whole to take it of. */
export function formatShare(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)} %` : 'n/a';
}

/** A rate between 0 and 1 as a whole percent. */
export const formatRate = (rate: number | null | undefined): string => (rate === null || rate === undefined ? 'n/a' : `${Math.round(rate * 100)} %`);

/** "Fri 16 Oct" for a `YYYY-MM-DD` day. */
export function formatDay(day: string): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? day : new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

/** "16 Oct 2026, 20:15" on the clock of a time zone; "n/a" for a missing time. */
export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return 'n/a';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'n/a' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(date);
}

/** "20:00" for an hour of the day. */
export const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;
