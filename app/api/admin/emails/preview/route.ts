/**
 * The preview of an e-mail for the editor (epic 463, docs/EMAIL_FORMAT_PLAN.md): the subject, the themed HTML and the plain-text part exactly as a user would get them, made by the same
 * function the sender uses (lib/email/compose.ts), from the texts the editor has typed so far, which need not be saved. Nothing is stored and nothing is sent.
 *
 * POST /api/admin/emails/preview   { eventId?, language?, subject, body, legal?, buttonLabel? } -> { subject, html, text, warnings: { withoutValue, unknown }, language }
 *   With `eventId` (the Mongo _id of an event, viewer access) the e-mail is drawn in the look of that event, with its name, teams, date and link, and, unless `legal` is given, with the
 *   legal part that applies to it. Without one the default look and sample values are used. `warnings` lists the variables the e-mail could not fill (left out) and the names that
 *   are not variables.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { requireAuth, apiBadRequest, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getPartnerScopedAccessForEvent } from '@/lib/partners/authorization';
import { composeEmail } from '@/lib/email/compose';
import { emailFactsOf } from '@/lib/email/event-link';
import { loadEventLegal } from '@/lib/email/legal';
import { DEFAULT_EVENT_TERMS_URL } from '@/lib/email/submission-template-defaults';
import { emailValues, sampleValues } from '@/lib/email/variables';
import { DEFAULT_UI_LANGUAGE, isUiLanguage, translate, type UiLanguage } from '@/lib/i18n';
import { loadEventTexts } from '@/lib/i18n/overrides';
import { resolveEventTheme } from '@/lib/theme/event-theme';
import { loadEventTheme } from '@/lib/theme/load';

const TEXT_LIMITS = { subject: 180, body: 5000, legal: 4000 };

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').slice(0, max) : '');

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') throw apiBadRequest('The body must be JSON: { subject, body }');

  const subjectTemplate = text(body.subject, TEXT_LIMITS.subject);
  const bodyTemplate = text(body.body, TEXT_LIMITS.body);
  let language: UiLanguage = isUiLanguage(body.language) ? body.language : DEFAULT_UI_LANGUAGE;
  let theme = resolveEventTheme({});
  let eventName = translate(language, 'email.eventFallback');
  let values = sampleValues(language);
  let legal: string | null = body.legal === undefined ? null : text(body.legal, TEXT_LIMITS.legal) || null;

  if (typeof body.eventId === 'string' && body.eventId) {
    if (!ObjectId.isValid(body.eventId)) throw apiBadRequest('Invalid event ID format');
    const db = await connectToDatabase();
    const access = await getPartnerScopedAccessForEvent(db, body.eventId, session, 'viewer');
    if (!access.allowed) throw apiForbidden('Partner-level Events access is required');
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(body.eventId) });
    if (!event) throw apiNotFound('Event');
    const loadedTexts = await loadEventTexts(db, event);
    if (!isUiLanguage(body.language)) language = loadedTexts.language;
    theme = await loadEventTheme(db, event).catch(() => theme);
    eventName = String(event.name ?? eventName);
    const sample = sampleValues(language);
    values = emailValues({
      recipientName: sample.name,
      eventName,
      shareUrl: sample.link,
      termsUrl: typeof event.notifications?.termsUrl === 'string' && event.notifications.termsUrl ? event.notifications.termsUrl : sample.terms ?? DEFAULT_EVENT_TERMS_URL,
      facts: emailFactsOf(event),
      language,
    });
    if (body.legal === undefined) legal = (await loadEventLegal(db, event, loadedTexts.partner)).effective?.text ?? null;
  }

  const composed = composeEmail({
    subjectTemplate,
    bodyTemplate,
    legal,
    values,
    theme,
    eventName,
    button: { label: text(body.buttonLabel, 60).trim() || translate(language, 'email.buttonOpen'), url: values.link ?? '' },
  });
  return apiSuccess({ ...composed, language });
});
