/**
 * Session cookie integrity (camera#122 / camera#119).
 *
 * WHAT: HMAC-SHA256 signs the plain-JSON session cookie on write and verifies it
 *     on read. The Mongo pointer cookie (`{v, sid}`) is not affected: its `sid`
 *     is a 256-bit random id that only the server can map to a session.
 * WHY: Before this, `getSession()` parsed the cookie and trusted every field in
 *     it, including `appRole`. Anyone could hand-write
 *     `{"user":{...},"appRole":"superadmin","expiresAt":"2099-..."}` into the
 *     `camera_session` cookie and pass `requireAdmin()`. The plain cookie is
 *     the fallback path when the Mongo session store is unavailable, so it
 *     had to stay - but it had to stop being trusted unverified.
 * HOW: Wire format is the session JSON plus one extra field `sig`, computed
 *     over the canonical JSON of the session WITHOUT `sig`
 *     (`JSON.stringify` preserves key order in both directions, so the bytes
 *     that were signed are the bytes that get verified). Unsigned or
 *     mis-signed cookies are rejected outright - there is no grace window,
 *     because an unsigned cookie is exactly the forgeable artefact this
 *     removes. A visitor still holding a pre-signing plain cookie is logged
 *     out once and signs in again.
 *
 * Signing key: the same resolver the OAuth PKCE state uses
 * (OAUTH_PKCE_STATE_SECRET, then SESSION_SECRET, then SSO_CLIENT_SECRET), so
 * there is one secret to rotate. No key means no plain cookie can be issued
 * or accepted: fail closed rather than fall back to unsigned.
 */

import crypto from 'crypto';
import { getOAuthPkceStateSigningKey } from './oauth-pkce-state';

const SIGNING_CONTEXT = 'camerasession1';
export const SESSION_SIGNATURE_FIELD = 'sig';

export class SessionSigningKeyMissingError extends Error {
  constructor() {
    super(
      'Session signing key missing: set SESSION_SECRET (or SSO_CLIENT_SECRET / OAUTH_PKCE_STATE_SECRET) so plain session cookies can be signed.'
    );
    this.name = 'SessionSigningKeyMissingError';
  }
}

export function getSessionSigningKey(): string | null {
  return getOAuthPkceStateSigningKey();
}

function hmac(key: string, canonical: string): string {
  return crypto.createHmac('sha256', key).update(`${SIGNING_CONTEXT}|${canonical}`).digest('base64url');
}

/** Serialize a session for the plain-cookie path. Throws when no signing key is configured. */
export function serializeSignedSession(session: object, key: string | null = getSessionSigningKey()): string {
  if (!key) throw new SessionSigningKeyMissingError();
  const canonical = JSON.stringify(session);
  return JSON.stringify({ ...JSON.parse(canonical), [SESSION_SIGNATURE_FIELD]: hmac(key, canonical) });
}

/**
 * Parse an already-JSON-parsed plain session cookie. Returns the session
 * without the signature field, or null when the cookie is unsigned, signed
 * with another key, or was modified after signing.
 */
export function verifySignedSession<T extends object>(parsed: unknown, key: string | null = getSessionSigningKey()): T | null {
  if (!key || typeof parsed !== 'object' || parsed === null) return null;
  const { [SESSION_SIGNATURE_FIELD]: sig, ...rest } = parsed as Record<string, unknown>;
  if (typeof sig !== 'string' || sig.length === 0) return null;
  const expected = hmac(key, JSON.stringify(rest));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return rest as T;
}
