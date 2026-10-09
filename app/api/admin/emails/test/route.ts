/**
 * A test e-mail to the editor who asks (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E6): the e-mail as it is drawn in the editor, made and sent by the same code a user's e-mail goes through,
 * to **the e-mail address of the signed-in editor and nobody else**, with "[Test]" in front of the subject, so the editor can read it on a phone before a user does. Nothing is stored.
 *
 * POST /api/admin/emails/test   { eventId?, language?, subject, body, legal?, buttonLabel? (null: no button) } -> { sent: true, to } or an error that says why not
 *   With `eventId` (the Mongo _id of an event, manager access) the e-mail has that event's look, name, teams, date, link and legal part, with a sample user. Without one, the default look.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { apiBadRequest, apiError, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { emailFactsOf, eventLinkOf } from '@/lib/email/event-link';
import { loadEventLegal } from '@/lib/email/legal';
import { sendSubmissionResultEmail } from '@/lib/email/submission-notification';
import { sampleValues } from '@/lib/email/variables';
import { DEFAULT_UI_LANGUAGE, isUiLanguage, translate, type UiLanguage } from '@/lib/i18n';
import { loadEventTexts } from '@/lib/i18n/overrides';
import { resolveEventTheme } from '@/lib/theme/event-theme';
import { loadEventTheme } from '@/lib/theme/load';

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').slice(0, max) : '');

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const to = session.user.email?.trim();
  if (!to) throw apiBadRequest('Your account has no e-mail address to send the test to');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { subject, body }');

  let language: UiLanguage = isUiLanguage(body.language) ? body.language : DEFAULT_UI_LANGUAGE;
  let theme = resolveEventTheme({});
  let eventName = translate(language, 'email.eventFallback');
  let facts = {};
  let shareUrl = sampleValues(language).link ?? '';
  let texts = null as Awaited<ReturnType<typeof loadEventTexts>>['overrides'] | null;
  let legal: string | null = body.legal === undefined ? null : text(body.legal, 4000) || null;

  if (typeof body.eventId === 'string' && body.eventId) {
    if (!ObjectId.isValid(body.eventId)) throw apiBadRequest('Invalid event ID format');
    const db = await connectToDatabase();
    const access = await getPartnerScopedAccessForEvent(db, body.eventId, session, 'manager');
    if (!access.allowed) throw apiForbidden('Partner-level Events manager access is required');
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(body.eventId) });
    if (!event) throw apiNotFound('Event');
    const loaded = await loadEventTexts(db, event);
    if (!isUiLanguage(body.language)) language = loaded.language;
    texts = loaded.overrides;
    theme = await loadEventTheme(db, event).catch(() => theme);
    eventName = String(event.name ?? eventName);
    facts = emailFactsOf(event);
    shareUrl = eventLinkOf(event) ?? shareUrl;
    if (body.legal === undefined) legal = (await loadEventLegal(db, event, loaded.partner)).effective?.text ?? null;
  }

  const result = await sendSubmissionResultEmail({
    recipientEmail: to,
    recipientName: session.user.name ?? null,
    eventName,
    shareUrl,
    subjectTemplate: `[Test] ${text(body.subject, 170)}`,
    bodyTemplate: text(body.body, 5000),
    theme,
    buttonLabel: typeof body.buttonLabel === 'string' ? text(body.buttonLabel, 60) : null,
    noButton: body.buttonLabel === null,
    language,
    texts,
    facts,
    legal,
  });

  if (result.sent) return apiSuccess({ sent: true, to });
  const reason = 'reason' in result ? result.reason : null;
  if (reason === 'missing_api_key' || reason === 'missing_from_address') throw apiError('E-mail sending is not configured on this server, so no test e-mail was sent', 503);
  throw apiError('The test e-mail could not be sent: ' + ('error' in result ? result.error : 'it was skipped'), 502);
});
