/**
 * The e-mails of an event (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E3): the five types with their switches and texts, the sender, the terms link and, for an event that uses try-on, the
 * two try-on e-mails.
 *
 * GET /api/admin/events/[id]/emails   the view (lib/email/event-emails.ts) (viewer)
 * PUT /api/admin/events/[id]/emails   { types?, senderName?, termsUrl?, tryOn? } (manager): `types` replaces what was stored for the five types ({ approved: { enabled, subject, body }, ... }, absent
 *   fields follow the default); `senderName` and `termsUrl` set or, with null, take away; `tryOn` changes the two older e-mails. Everything else stored stays. Answers the new view.
 *
 * `[id]` is the Mongo _id of the event, as in the other admin event routes.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import type { Session } from '@/lib/auth/session';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import { loadEventEmails } from '@/lib/email/event-emails';
import { mergeNotificationSettings, type LegacyModePatch, type NotificationsPatch } from '@/lib/email/notification-settings';

type RouteContext = { params?: Promise<{ id: string }> };

/** Access first, then the lookup: a caller without access to the event learns nothing about whether it exists. */
async function loadEvent(id: string, session: Session, minRole: 'viewer' | 'manager') {
  if (!ObjectId.isValid(id)) throw apiBadRequest('Invalid event id');
  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, id, minRole);
  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) });
  if (!event) throw apiNotFound('Event');
  return { db, event };
}

const SENDER_MAX = 120;

function address(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw apiBadRequest('The terms link must be a web address');
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
    return value.trim();
  } catch {
    throw apiBadRequest('The terms link must be a web address starting with https://');
  }
}

function legacy(value: unknown, name: string): LegacyModePatch | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw apiBadRequest(`${name} must be an object`);
  const { enabled, subject, body } = value as Record<string, unknown>;
  if (enabled !== undefined && typeof enabled !== 'boolean') throw apiBadRequest(`${name}.enabled must be true or false`);
  for (const [field, text] of [['subject', subject], ['body', body]] as const) if (text !== undefined && text !== null && typeof text !== 'string') throw apiBadRequest(`${name}.${field} must be text`);
  return { enabled: enabled as boolean | undefined, subject: subject as string | null | undefined, body: body as string | null | undefined };
}

export const GET = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session, 'viewer');
  return apiSuccess(await loadEventEmails(db, event));
});

export const PUT = withErrorHandler(async (request: NextRequest, context?: RouteContext) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { id } = await context!.params!;
  const { db, event } = await loadEvent(id, session, 'manager');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('A JSON body is required');

  const patch: NotificationsPatch = {};
  if (body.types !== undefined) {
    if (!body.types || typeof body.types !== 'object' || Array.isArray(body.types)) throw apiBadRequest('types must be an object');
    patch.types = body.types;
  }
  if (body.senderName !== undefined) {
    if (body.senderName !== null && (typeof body.senderName !== 'string' || body.senderName.length > SENDER_MAX)) throw apiBadRequest(`The sender name must be text of at most ${SENDER_MAX} characters`);
    patch.senderName = body.senderName === null ? null : body.senderName.trim();
  }
  if (body.termsUrl !== undefined) patch.termsUrl = address(body.termsUrl);
  if (body.tryOn !== undefined) {
    if (!body.tryOn || typeof body.tryOn !== 'object') throw apiBadRequest('tryOn must be an object');
    const { related, resubmission } = body.tryOn as Record<string, unknown>;
    patch.tryOn = { related: legacy(related, 'tryOn.related'), resubmission: legacy(resubmission, 'tryOn.resubmission') };
  }

  const notifications = mergeNotificationSettings(event.notifications, patch);
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, { $set: { notifications, updatedAt: generateTimestamp() } });
  return apiSuccess(await loadEventEmails(db, { ...event, notifications }));
});
