/**
 * POST /api/internal/email/send
 *
 * Shared cross-app email service. Camera is the ONE place in the SEYU stack
 * with a Resend integration and a verified sending domain; instead of
 * messmass (and eventually fanmass, if it ever needs email) each keeping
 * their own separate Resend account/dependency/error-handling, they call
 * this endpoint. One provider, one verified domain, one place email-sending
 * logic gets fixed when it needs fixing. See SSO_EMAIL_UNIFICATION_PLAN.md.
 *
 * Auth: shared secret, same as every other internal/* route -- accepts
 * either the messmass or fanmass caller secret (x-messmass-secret /
 * x-fanmass-secret / Bearer). Reuses those exact secrets rather than
 * inventing a third one: this is the same trust boundary ("this caller is
 * messmass" / "this caller is fanmass") those routes already establish, just
 * applied to a new capability.
 *
 * Body: { to, subject, html, text?, fromName?, fromLocalPart? }
 * - `to`/`subject`/`html` are required.
 * - `fromName` becomes the display name (e.g. "messmass"); `fromLocalPart`
 *   becomes the address local-part (e.g. "notifications" -> notifications@<domain>).
 *   Both are optional -- defaults to the calling app's name and "notifications".
 * - The domain is ALWAYS Camera's own verified Resend domain (parsed from
 *   CAMERA_EMAIL_FROM) -- callers can customize the display name and
 *   local-part, never the domain, so this endpoint can't be used to send
 *   from an arbitrary unverified address.
 *
 * Response: { sent: true, messageId } | { sent: false, error } -- always 200
 * when the request itself was well-formed; "sent: false" means Resend
 * rejected or isn't configured, which callers should treat as a soft
 * failure (log it, don't crash the caller's own request), not retry-forever.
 */

import { NextRequest } from 'next/server';
import { apiBadRequest, apiSuccess, checkRateLimit, RATE_LIMITS, withErrorHandler } from '@/lib/api';
import { assertInternalMessmassSecret } from '@/lib/messmass/internal';
import { assertInternalFanmassSecret } from '@/lib/fanmass/internal';
import { sanitizeEmail } from '@/lib/security/sanitize';
import { getVerifiedSendingDomain, sendEmail } from '@/lib/email/send';

type Caller = 'messmass' | 'fanmass';

function assertInternalEmailCaller(request: Request): Caller {
  try {
    assertInternalMessmassSecret(request);
    return 'messmass';
  } catch {
    // fall through to the other caller check; assertInternalFanmassSecret
    // throws (403) if this request isn't a valid fanmass caller either.
  }
  assertInternalFanmassSecret(request);
  return 'fanmass';
}

function escapeQuotes(value: string): string {
  return value.replace(/["\\]/g, (char) => `\\${char}`);
}

function buildFrom(caller: Caller, fromName?: unknown, fromLocalPart?: unknown): string {
  const domain = getVerifiedSendingDomain();
  if (!domain) return '';

  const name = (typeof fromName === 'string' && fromName.trim() ? fromName.trim() : caller).slice(0, 80);
  const rawLocalPart = typeof fromLocalPart === 'string' ? fromLocalPart.trim() : '';
  const localPart = /^[a-zA-Z0-9._-]+$/.test(rawLocalPart) ? rawLocalPart : 'notifications';

  return `"${escapeQuotes(name)}" <${localPart}@${domain}>`;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const caller = assertInternalEmailCaller(request);
  await checkRateLimit(request, RATE_LIMITS.INTERNAL_WRITE);

  const body = await request.json().catch(() => ({}));

  const to = sanitizeEmail(String(body.to || ''));
  if (!to) return apiBadRequest('to is required (must be a valid email address)');

  const subject = String(body.subject || '').trim().slice(0, 200);
  if (!subject) return apiBadRequest('subject is required');

  const html = String(body.html || '');
  if (!html) return apiBadRequest('html is required');

  const text = typeof body.text === 'string' ? body.text : undefined;
  const from = buildFrom(caller, body.fromName, body.fromLocalPart);

  const result = await sendEmail({ to, subject, html, text, from: from || undefined });

  if (!result.sent) {
    console.error('[internal/email] send failed', { caller, to, subject, error: result.error });
    return apiSuccess({ sent: false, error: result.error });
  }

  console.info('[internal/email] sent', { caller, to, subject, messageId: result.messageId });
  return apiSuccess({ sent: true, messageId: result.messageId });
});
