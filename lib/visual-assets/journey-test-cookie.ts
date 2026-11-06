import crypto from 'node:crypto';

export const JOURNEY_TEST_COOKIE = 'camera_journey_test';
const PREFIX = 'camerajourneytest1';
const TTL_SECONDS = 30 * 60;

export interface JourneyTestGrant {
  eventId: string;
  templateId: string;
  expiresAt: number;
}

function signature(key: string, payload: string): string {
  return crypto.createHmac('sha256', key).update(`${PREFIX}|${payload}`).digest('base64url');
}

function signingKey(): string | null {
  return process.env.OAUTH_PKCE_STATE_SECRET?.trim()
    || process.env.SESSION_SECRET?.trim()
    || process.env.SSO_CLIENT_SECRET?.trim()
    || null;
}

export function createJourneyTestGrant(eventId: string, templateId: string, now = Math.floor(Date.now() / 1000)): string | null {
  const key = signingKey();
  if (!key || !/^[a-f\d]{24}$/i.test(eventId) || !/^[A-Za-z0-9_-]{1,100}$/.test(templateId)) return null;
  const payload = Buffer.from(JSON.stringify({ eventId, templateId, expiresAt: now + TTL_SECONDS }), 'utf8').toString('base64url');
  return `${PREFIX}.${payload}.${signature(key, payload)}`;
}

export function readJourneyTestGrant(token: string | null | undefined, eventId: string, now = Math.floor(Date.now() / 1000)): JourneyTestGrant | null {
  const key = signingKey();
  if (!key || !token) return null;
  const [prefix, payload, suppliedSignature, extra] = token.split('.');
  if (prefix !== PREFIX || !payload || !suppliedSignature || extra !== undefined) return null;
  try {
    const expected = Buffer.from(signature(key, payload), 'base64url');
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<JourneyTestGrant>;
    if (parsed.eventId !== eventId || typeof parsed.templateId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(parsed.templateId)) return null;
    if (typeof parsed.expiresAt !== 'number' || !Number.isInteger(parsed.expiresAt) || parsed.expiresAt < now) return null;
    return { eventId, templateId: parsed.templateId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}
