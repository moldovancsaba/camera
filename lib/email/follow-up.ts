/**
 * The follow-up e-mail (epic 463, issue 559; owner answer 296: "the daily job that sends the follow-up e-mail a week after the event"): once to each user who has an approved photo at an event, a
 * week after the event, to look back at the memory. The rules (when, which event, which user) are in follow-up-rules.ts and docs/EMAIL_TEMPLATES.md; this is the job that applies them.
 *
 * - **Off unless chosen.** Only an event that has the follow up on sends it (its own switch, else its partner's default, else off), and only one that has a date; nothing changes for any other event.
 * - **Safe to run twice, and to run at the same time.** Each e-mail is claimed first, in `email_follow_ups`, under an id made of the event and a hash of the address (the id is unique in MongoDB
 *   whatever indexes exist): only the run that wins the claim sends. A claim that is still there with no `sentAt` means a run stopped between the claim and the answer; it is never taken over (the
 *   e-mail may have gone), only counted as `held`. A send that fails gives the claim back, adds an attempt and is tried again on the next run, up to `FOLLOW_UP_MAX_ATTEMPTS`.
 * - **A dry run only counts.** It reads the same events, photos and claims and writes nothing and sends nothing.
 * - **A run ends inside its time.** It sends at most `maxSends` e-mails and stops starting new ones after `budgetMs`; what is left is counted as `remaining` and the next run (or button press) continues.
 * - **The row holds no address.** Its id is a hash; it holds the event, when it was claimed and sent, the number of attempts and the last reason (a short code, never the provider's text).
 *
 * Dependencies (the sender, the clock) are injected, so it is unit-tested with the fake database and a fake sender and never sends a real e-mail (follow-up.test.ts). Server side.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  FOLLOW_UP_MAX_ATTEMPTS,
  FOLLOW_UP_MAX_SENDS_PER_RUN,
  FOLLOW_UP_MIN_AGE_DAYS,
  addDays,
  calendarDay,
  followUpKey,
  followUpTiming,
  hasAcceptedConsent,
} from '@/lib/email/follow-up-rules';
import type { SubmissionNotificationInput, SubmissionNotificationResult } from '@/lib/email/submission-notification';
import { approvedShareUrl } from '@/lib/photo-vetting/emails';
import { buildSubmissionShareUrl, resolveSubmissionResultEmailRecipient } from '@/lib/email/submission-result-email';
import { prepareTypedEmail } from '@/lib/email/typed-email';
import { publiclyVisibleClauses } from '@/lib/submissions/visibility';

export interface FollowUpDeps {
  send: (input: SubmissionNotificationInput) => Promise<SubmissionNotificationResult>;
  now: () => Date;
  /** How long after the day of the event the e-mail is still sent. */
  maxAgeDays: number;
  /** Most e-mails in this run (default `FOLLOW_UP_MAX_SENDS_PER_RUN`). */
  maxSends?: number;
  /** Stop starting new e-mails after this many milliseconds (default none). */
  budgetMs?: number;
  /** A millisecond clock for the budget (default `Date.now`). */
  clock?: () => number;
}

export interface FollowUpEventReport {
  eventId: string;
  name: string;
  /** The calendar day of the event. */
  day: string;
  /** Users who have an address, an approved photo and agreed to the terms. */
  eligible: number;
  /** Of those: already sent, a claim that was never answered, tried and failed too often. */
  alreadySent: number;
  held: number;
  gaveUp: number;
  /** Photos of the event with no usable e-mail address; users with an address who did not agree to the terms. */
  photosWithoutAddress: number;
  withoutConsent: number;
  /** Dry run: how many e-mails a real run would send now (capped at the run's limit). Real run: how many went. */
  toSend: number;
  sent: number;
  failed: number;
}

export interface FollowUpResult {
  dryRun: boolean;
  /** Today's calendar day, in the event's country. */
  today: string;
  maxAgeDays: number;
  /** Events with a date in the window; of those, how many have the follow up on; events that have it on but no usable date. */
  eventsInWindow: number;
  eventsOn: number;
  eventsOnWithoutDate: number;
  /** Totals over the events that have it on. */
  eligible: number;
  alreadySent: number;
  held: number;
  gaveUp: number;
  photosWithoutAddress: number;
  withoutConsent: number;
  toSend: number;
  sent: number;
  failed: number;
  /** Not started in this run because of the run's limits (a dry run does not apply them: it says how many a real run has to do). */
  remaining: number;
  events: FollowUpEventReport[];
}

const EVENT_LIMIT = 500;
const SUBMISSION_LIMIT = 5000;
const NO_ADDRESS = new Set(['anonymous@event', 'anonymous@event.com']);

interface Candidate {
  email: string;
  name: string | null;
  /** The link to the newest photo of the user at the event. */
  shareUrl: string;
  consented: boolean;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The users of an event who may get the follow up: one for each address, with the link to their newest approved photo, whether they agreed to the terms, and the number of photos with no usable address. */
async function usersOf(db: Db, event: Document): Promise<{ users: Candidate[]; photosWithoutAddress: number }> {
  const keys = [text(event.eventId), String(event._id ?? '')].filter(Boolean);
  const docs = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .find(
      { $and: [{ $or: [{ eventId: { $in: keys } }, { eventIds: { $in: keys } }] }, ...publiclyVisibleClauses(keys), { submissionKind: { $ne: 'tryon_result' } }] },
      { projection: { _id: 1, shareToken: 1, userInfo: 1, userEmail: 1, userName: 1, consents: 1, createdAt: 1 } }
    )
    .sort({ createdAt: -1 })
    .limit(SUBMISSION_LIMIT)
    .toArray();

  const byAddress = new Map<string, Candidate>();
  let photosWithoutAddress = 0;
  for (const doc of docs) {
    const recipient = resolveSubmissionResultEmailRecipient(doc as never);
    if (!recipient.email || NO_ADDRESS.has(recipient.email)) {
      photosWithoutAddress += 1;
      continue;
    }
    const seen = byAddress.get(recipient.email);
    if (seen) {
      // The newest photo (the list is newest first) gave the link; any photo's consent counts for the person.
      seen.consented = seen.consented || hasAcceptedConsent(doc);
      continue;
    }
    const token = text(doc.shareToken);
    byAddress.set(recipient.email, {
      email: recipient.email,
      name: recipient.name,
      shareUrl: token ? approvedShareUrl(token) : buildSubmissionShareUrl(String(doc._id)),
      consented: hasAcceptedConsent(doc),
    });
  }
  return { users: [...byAddress.values()], photosWithoutAddress };
}

/** The reason a send did not go, as a short code (never the provider's own words, which can hold an address). */
function reasonOf(result: SubmissionNotificationResult): string {
  if (result.sent) return 'sent';
  return 'reason' in result ? result.reason : 'send_failed';
}

export async function runFollowUps(db: Db, deps: FollowUpDeps, options: { dryRun: boolean }): Promise<FollowUpResult> {
  const now = deps.now();
  const today = calendarDay(now) ?? now.toISOString().slice(0, 10);
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const maxSends = deps.maxSends ?? FOLLOW_UP_MAX_SENDS_PER_RUN;
  const claims = db.collection(COLLECTIONS.EMAIL_FOLLOW_UPS);

  const result: FollowUpResult = {
    dryRun: options.dryRun,
    today,
    maxAgeDays: deps.maxAgeDays,
    eventsInWindow: 0,
    eventsOn: 0,
    eventsOnWithoutDate: 0,
    eligible: 0,
    alreadySent: 0,
    held: 0,
    gaveUp: 0,
    photosWithoutAddress: 0,
    withoutConsent: 0,
    toSend: 0,
    sent: 0,
    failed: 0,
    remaining: 0,
    events: [],
  };

  // The events whose day is in the window, with a day of margin each side (the dates are text, plain days or ISO times); the exact test is followUpTiming.
  const from = addDays(today, -(deps.maxAgeDays + 1));
  const until = addDays(today, -(FOLLOW_UP_MIN_AGE_DAYS - 1));
  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find({ eventDate: { $gte: from, $lt: addDays(until, 1) } })
    .sort({ eventDate: 1 })
    .limit(EVENT_LIMIT)
    .toArray();

  let sendsLeft = maxSends;
  let stopped = false;
  for (const event of events) {
    const timing = followUpTiming(event.eventDate, now, deps.maxAgeDays);
    if (timing.state !== 'due') continue;
    result.eventsInWindow += 1;
    const prepared = await prepareTypedEmail(db, event, 'followUp');
    if (!prepared.enabled) continue;
    result.eventsOn += 1;

    const eventKey = text(event.eventId) || String(event._id);
    const { users, photosWithoutAddress } = await usersOf(db, event);
    const report: FollowUpEventReport = {
      eventId: eventKey,
      name: text(event.name),
      day: timing.day,
      eligible: 0,
      alreadySent: 0,
      held: 0,
      gaveUp: 0,
      photosWithoutAddress,
      withoutConsent: 0,
      toSend: 0,
      sent: 0,
      failed: 0,
    };

    for (const user of users) {
      if (!user.consented) {
        report.withoutConsent += 1;
        continue;
      }
      report.eligible += 1;
      const id = followUpKey(eventKey, user.email);
      const row = await claims.findOne({ _id: id } as never);
      if (row?.sentAt) {
        report.alreadySent += 1;
        continue;
      }
      if (row?.claimedAt) {
        report.held += 1;
        continue;
      }
      const attempts = typeof row?.attempts === 'number' ? row.attempts : 0;
      if (attempts >= FOLLOW_UP_MAX_ATTEMPTS) {
        report.gaveUp += 1;
        continue;
      }

      if (options.dryRun) {
        // A dry run does not apply the run's limits: it says how many e-mails there are to send; `toSend` of a real run is what it sent.
        report.toSend += 1;
        continue;
      }
      if (stopped || sendsLeft <= 0 || (deps.budgetMs !== undefined && clock() - startedAt >= deps.budgetMs)) {
        stopped = true;
        result.remaining += 1;
        continue;
      }

      const at = now.toISOString();
      if (!row) {
        // The id is unique, so of two runs at the same moment only one inserts; the other gets a duplicate error and leaves this e-mail to it.
        const inserted = await claims.insertOne({ _id: id, eventId: eventKey, createdAt: at, attempts: 0 } as never).then(
          () => true,
          () => false
        );
        if (!inserted) {
          report.held += 1;
          continue;
        }
      }
      const claim = await claims.updateOne({ _id: id, sentAt: { $exists: false }, claimedAt: { $exists: false } } as never, { $set: { claimedAt: at } });
      if (claim.matchedCount === 0) {
        report.held += 1;
        continue;
      }

      sendsLeft -= 1;
      let outcome: SubmissionNotificationResult | null = null;
      try {
        outcome = await deps.send(prepared.build({ email: user.email, name: user.name }, user.shareUrl));
      } catch {
        outcome = null;
      }
      if (outcome?.sent) {
        report.sent += 1;
        await claims.updateOne({ _id: id } as never, { $set: { sentAt: new Date().toISOString(), attempts: attempts + 1 }, $unset: { claimedAt: '' } });
      } else {
        report.failed += 1;
        // The claim is given back, so the next run tries again until the attempts are used up.
        await claims.updateOne({ _id: id } as never, {
          $set: { attempts: attempts + 1, lastFailedAt: new Date().toISOString(), lastReason: outcome ? reasonOf(outcome) : 'send_failed' },
          $unset: { claimedAt: '' },
        });
      }
    }

    result.events.push(report);
    for (const key of ['eligible', 'alreadySent', 'held', 'gaveUp', 'photosWithoutAddress', 'withoutConsent', 'toSend', 'sent', 'failed'] as const) result[key] += report[key];
  }

  // Events that have it on but no usable date can never send it: said, so the editor can fix the date.
  result.eventsOnWithoutDate = await countOnWithoutDate(db);
  return result;
}

/** Events with the follow up on (their own switch or their partner's default) that have no usable date: nothing is sent for them until a date is set. A read only. */
async function countOnWithoutDate(db: Db): Promise<number> {
  const events = await db
    .collection(COLLECTIONS.EVENTS)
    .find({ $or: [{ eventDate: { $exists: false } }, { eventDate: null }, { eventDate: '' }] })
    .limit(EVENT_LIMIT)
    .toArray();
  let count = 0;
  for (const event of events) {
    if (calendarDay(event.eventDate) !== null) continue;
    if ((await prepareTypedEmail(db, event, 'followUp')).enabled) count += 1;
  }
  return count;
}

/** The partner's default for the follow-up e-mail: true or false for its events that made no choice, null takes the choice away (they follow the standard, off). False when no such partner. */
export async function savePartnerFollowUp(db: Db, partnerId: string, value: boolean | null, now: string): Promise<boolean> {
  const update = value === null ? { $set: { updatedAt: now }, $unset: { followUpEmail: '' } } : { $set: { followUpEmail: value, updatedAt: now } };
  const result = await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId }, update);
  return result.matchedCount > 0;
}
