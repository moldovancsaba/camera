/**
 * Time helpers of the Analytics report (issue 521, docs/ANALYTICS_AUDIT.md). Pure and DOM-free; unit-tested in time.test.ts.
 *
 * Every time in the database is an ISO 8601 string in UTC. The report puts a photo on a day and an hour of the clock of one time zone (the match is in Budapest, so the default for a Hungarian
 * event is Budapest), chosen on the page and always named on it, so "photos by hour" means the hour the user saw on the clock. A day is `YYYY-MM-DD`, an hour is 0 to 23.
 */

export interface ReportTimeZone {
  id: string;
  label: string;
}

/** The two clocks the page offers: more can be added here without touching anything else. */
export const REPORT_TIME_ZONES: readonly ReportTimeZone[] = [
  { id: 'Europe/Budapest', label: 'Budapest' },
  { id: 'UTC', label: 'UTC' },
];

/** The clock for an event: Budapest for a Hungarian event, UTC otherwise. */
export function defaultTimeZone(uiLanguage: unknown): string {
  return uiLanguage === 'hu' ? 'Europe/Budapest' : 'UTC';
}

/** A time zone from the query string: one of the offered ones, else the fallback. */
export function resolveTimeZone(input: unknown, fallback: string): string {
  return typeof input === 'string' && REPORT_TIME_ZONES.some((zone) => zone.id === input) ? input : fallback;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The day and the hour of a time on the clock of a time zone; null for a missing or invalid time. */
export function localParts(iso: unknown, timeZone: string): { day: string; hour: number } | null {
  if (typeof iso !== 'string' || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) parts[part.type] = part.value;
  const hour = Number(parts.hour);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: hour === 24 ? 0 : hour };
}

/** Whole seconds from one time to a later one; null when either is invalid or the second is earlier (a clock slip is not a duration). */
export function secondsBetween(fromIso: unknown, toIso: unknown): number | null {
  if (typeof fromIso !== 'string' || typeof toIso !== 'string') return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round((to - from) / 1000);
}

export function average(values: readonly number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

/** Whether a day (`YYYY-MM-DD`) lies in the range, both ends included; an empty end is open. A malformed end is ignored. */
export function dayInRange(day: string, from: string | null | undefined, to: string | null | undefined): boolean {
  const valid = (value: string | null | undefined): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (valid(from) && day < from) return false;
  if (valid(to) && day > to) return false;
  return true;
}

/** Every day from the first to the last, both included (at most `limit`), so a quiet day shows as zero instead of being left out. */
export function daysBetween(first: string, last: string, limit = 400): string[] {
  const days: string[] = [];
  const cursor = new Date(`${first}T00:00:00.000Z`);
  const end = new Date(`${last}T00:00:00.000Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return days;
  while (cursor <= end && days.length < limit) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** A duration in seconds in words: "45 s", "2 min 5 s", "1 h 20 min", "2 d 3 h". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return 'n/a';
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return total % 60 === 0 ? `${minutes} min` : `${minutes} min ${total % 60} s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days} d` : `${days} d ${hours % 24} h`;
}
