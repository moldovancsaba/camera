/**
 * The triggers of the e-mails that are not the link to the photo (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E8): **welcome**, when somebody registers (gives a name and an e-mail, or signs in,
 * before the photo; owner answer 201), and **arrived**, when a photo is submitted. Both are off by default; an event whose editor switched one on sends it, once for each event and address
 * (welcome) or each photo (arrived). **Follow up** is not a trigger: the daily job sends it (lib/email/follow-up.ts, owner answer 296). Server side; unit-tested in triggers.test.ts.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { sendSubmissionResultEmail, type SubmissionNotificationInput, type SubmissionNotificationResult } from '@/lib/email/submission-notification';
import { resolveEventForSubmission, resolveSubmissionResultEmailRecipient } from '@/lib/email/submission-result-email';
import { prepareTypedEmail } from '@/lib/email/typed-email';
import { sanitizeEmail } from '@/lib/security/sanitize';

type EmailSender = (input: SubmissionNotificationInput) => Promise<SubmissionNotificationResult>;
type TriggeredType = 'welcome' | 'arrived';

/** Sends one of the two e-mails to one address, in the event's language, look and legal part; null when the event has it switched off (nothing is read or sent). */
async function sendTriggered(
  db: Db,
  event: Document,
  type: TriggeredType,
  to: { email: string; name: string | null },
  send: EmailSender
): Promise<SubmissionNotificationResult | null> {
  const prepared = await prepareTypedEmail(db, event, type);
  if (!prepared.enabled) return null;
  return send(prepared.build(to));
}

export interface ArrivedResult {
  sent: boolean;
  metadataPatch: Record<string, unknown>;
}

/**
 * The "arrived" e-mail of a submitted photo: sent once (`metadata.arrivedEmailSentAt`), to the address the user gave, when the event has it switched on. Null when there is nothing to do:
 * it is off, was already sent, the photo is not an original, or no address is known yet (a later call, after the contact is saved, tries again).
 */
export async function dispatchArrivedEmail(db: Db, submission: Document, send: EmailSender = sendSubmissionResultEmail): Promise<ArrivedResult | null> {
  if (submission.metadata?.arrivedEmailSentAt) return null;
  if (submission.submissionKind && submission.submissionKind !== 'original') return null;
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  if (!recipient.email) return null;
  const event = await resolveEventForSubmission(db, submission as never);
  if (!event) return null;
  const result = await sendTriggered(db, event, 'arrived', { email: recipient.email, name: recipient.name }, send);
  if (!result) return null;
  return { sent: result.sent, metadataPatch: result.sent ? { 'metadata.arrivedEmailSentAt': new Date().toISOString() } : {} };
}

const NAME_MAX = 120;

/**
 * Registers somebody at an event and sends the welcome e-mail if the event has it switched on, **once for each event and address**: one row in `email_registrations` is claimed before the
 * send, so two calls at once send one e-mail, and a failed send gives the claim back so a later call may try again. The address is not verified, so the e-mail is only the welcome note
 * and the link to the event. Returns whether the address was acceptable; never whether an e-mail went.
 */
export async function registerVisitor(db: Db, event: Document, input: { name?: unknown; email?: unknown }, send: EmailSender = sendSubmissionResultEmail): Promise<boolean> {
  const email = typeof input.email === 'string' ? sanitizeEmail(input.email) : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '';
  const eventKey = String(event.eventId ?? event._id);
  const key = { eventId: eventKey, email: email.toLowerCase() };
  const registrations = db.collection(COLLECTIONS.EMAIL_REGISTRATIONS);
  const now = new Date().toISOString();

  const existing = await registrations.findOne(key);
  if (existing) {
    await registrations.updateOne(key, { $set: { ...(name ? { name } : {}), lastSeenAt: now } });
  } else {
    // A second call at the same moment may insert first: the unique index refuses this one, and the claim below still lets only one send.
    await registrations.insertOne({ ...key, name, createdAt: now, lastSeenAt: now }).catch(() => undefined);
  }

  const claim = await registrations.updateOne({ ...key, welcomeSentAt: { $exists: false }, welcomeClaimedAt: { $exists: false } }, { $set: { welcomeClaimedAt: now } });
  if (claim.matchedCount === 0) return true;
  let sent = false;
  try {
    const result = await sendTriggered(db, event, 'welcome', { email, name: name || null }, send);
    sent = Boolean(result?.sent);
    // Off for this event: the claim is given back, so switching it on later welcomes the people who register after that (not those who registered before).
  } finally {
    await registrations.updateOne(key, sent ? { $set: { welcomeSentAt: new Date().toISOString() }, $unset: { welcomeClaimedAt: '' } } : { $unset: { welcomeClaimedAt: '' } });
  }
  return true;
}
