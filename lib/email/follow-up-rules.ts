/**
 * The rules of the follow-up e-mail (epic 463, issue 559; owner answer 296): one e-mail to each user, a week after the event, to look back at the memory. Pure, so the daily job, the admin run and
 * the tests all read the same rules; the database work is in follow-up.ts. Unit-tested in follow-up-rules.test.ts.
 *
 * - **When.** The event has a date (`Event.eventDate`, a calendar day). The follow-up is due from the 7th day after that day (`FOLLOW_UP_MIN_AGE_DAYS`) and is still sent up to `maxAgeDays` after it
 *   (`FOLLOW_UP_MAX_AGE_DAYS`, default 21), so a job that did not run for a few days catches up, but an event from months ago is never mailed because somebody switched the e-mail on late. Days are
 *   calendar days of the event's country (Europe/Budapest, as the `{date}` variable).
 * - **Which event.** Only one that has the e-mail switched on: its own choice, else its partner's default, else off (lib/email/types.ts `switchIsOn`).
 * - **Which user.** Gave an e-mail address (not a placeholder), has a photo at the event that is shown publicly (approved, not hidden, not gone) and agreed to the terms (an accepted consent record on one of
 *   those photos). One e-mail for each address and event, whatever the number of photos.
 * - **Never twice.** The claim in `email_follow_ups` is keyed by a hash of the event and the address (`followUpKey`).
 */

import crypto from 'crypto';

/** The first day the e-mail is sent, counted from the day of the event. */
export const FOLLOW_UP_MIN_AGE_DAYS = 7;
/** How long after the day of the event it is still sent, unless the environment says otherwise (`FOLLOW_UP_MAX_AGE_DAYS`). */
export const FOLLOW_UP_DEFAULT_MAX_AGE_DAYS = 21;
/** A send that fails is tried again on the next run, this many times in all, then left (the reason is on the row). */
export const FOLLOW_UP_MAX_ATTEMPTS = 3;
/** Most e-mails one run sends, so a run ends inside the function's time; the next run (or the next press of the button) continues. */
export const FOLLOW_UP_MAX_SENDS_PER_RUN = 120;
/** The calendar of the event's country: the same one `{date}` is written in. */
export const FOLLOW_UP_TIME_ZONE = 'Europe/Budapest';

/** The longest age (days after the day of the event) the e-mail is still sent: the environment's whole number from 8 to 120, else the default. */
export function followUpMaxAgeDays(raw: string | undefined | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > FOLLOW_UP_MIN_AGE_DAYS && value <= 120 ? value : FOLLOW_UP_DEFAULT_MAX_AGE_DAYS;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day (`YYYY-MM-DD`) of a date as written in an event (a plain day, or an ISO time read in the event's country); null when it is not a date. */
export function calendarDay(value: unknown): string | null {
  if (typeof value === 'string' && DAY.test(value.trim())) {
    const day = value.trim();
    return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
  }
  const date = value instanceof Date ? value : typeof value === 'string' && value.trim() ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: FOLLOW_UP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Whole days from one calendar day to another (negative when the second is earlier). */
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/** The calendar day `days` after (or, negative, before) a day. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export type FollowUpTiming =
  | { state: 'no_date' }
  | { state: 'too_early'; day: string; daysLeft: number }
  | { state: 'due'; day: string; age: number }
  | { state: 'too_old'; day: string; age: number };

/** Where an event stands: no usable date, not yet a week after, due, or past the window. `now` is read in the event's country. */
export function followUpTiming(eventDate: unknown, now: Date, maxAgeDays: number = FOLLOW_UP_DEFAULT_MAX_AGE_DAYS): FollowUpTiming {
  const day = calendarDay(eventDate);
  const today = calendarDay(now);
  if (!day || !today) return { state: 'no_date' };
  const age = daysBetween(day, today);
  if (age < FOLLOW_UP_MIN_AGE_DAYS) return { state: 'too_early', day, daysLeft: FOLLOW_UP_MIN_AGE_DAYS - age };
  if (age > maxAgeDays) return { state: 'too_old', day, age };
  return { state: 'due', day, age };
}

export type ParsedFollowUpDefault = { ok: true; value: boolean | null } | { ok: false; error: string };

/** A request value for the partner's default: true or false, or empty / null for no choice (the events then follow the standard, off); anything else is refused. */
export function parseFollowUpDefault(input: unknown): ParsedFollowUpDefault {
  if (input === null || input === '') return { ok: true, value: null };
  if (typeof input === 'boolean') return { ok: true, value: input };
  return { ok: false, error: 'followUp must be true or false' };
}

/** The id of the claim row of one e-mail: a hash of the event and the (lower-cased) address, so the collection holds no address. */
export function followUpKey(eventKey: string, email: string): string {
  const digest = crypto.createHash('sha256').update(`${eventKey}\n${email.trim().toLowerCase()}`, 'utf8').digest('hex').slice(0, 40);
  return `followup:${eventKey}:${digest}`;
}

/** Whether a submission carries at least one accepted consent record (the terms the user agreed to on the event's consent page, or the one sentence of the Who are you page). */
export function hasAcceptedConsent(submission: Record<string, unknown> | null | undefined): boolean {
  const consents = submission?.consents;
  return Array.isArray(consents) && consents.some((record) => Boolean(record) && typeof record === 'object' && (record as { accepted?: unknown }).accepted === true);
}
