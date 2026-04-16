/**
 * Cookieless PKCE handoff: HMAC-signed payload in OAuth `state` so Chrome/Safari work even when
 * `camera_pending_session` is blocked or dropped on the IdP → callback hop.
 *
 * Signing key (first non-empty): OAUTH_PKCE_STATE_SECRET, SESSION_SECRET, SSO_CLIENT_SECRET.
 */

import crypto from 'crypto';

const STATE_PREFIX = 'fffpkce1';
const TTL_SEC = 15 * 60;

export function getOAuthPkceStateSigningKey(): string | null {
  const k =
    process.env.OAUTH_PKCE_STATE_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.SSO_CLIENT_SECRET?.trim();
  return k || null;
}

export function encodeSignedOAuthPkceState(signingKey: string, codeVerifier: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const payload = `${exp}|${codeVerifier}`;
  const pb64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', signingKey)
    .update(`${STATE_PREFIX}|${pb64}`)
    .digest('base64url');
  return `${STATE_PREFIX}.${pb64}.${sig}`;
}

export function decodeSignedOAuthPkceState(signingKey: string, state: string): string | null {
  const parts = state.split('.');
  if (parts.length !== 3 || parts[0] !== STATE_PREFIX) return null;
  const pb64 = parts[1];
  const sig = parts[2];
  if (!pb64 || !sig) return null;
  try {
    const expected = crypto
      .createHmac('sha256', signingKey)
      .update(`${STATE_PREFIX}|${pb64}`)
      .digest('base64url');
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const raw = Buffer.from(pb64, 'base64url').toString('utf8');
    const pipe = raw.indexOf('|');
    if (pipe <= 0) return null;
    const exp = parseInt(raw.slice(0, pipe), 10);
    const verifier = raw.slice(pipe + 1);
    if (!Number.isFinite(exp) || !verifier) return null;
    if (Math.floor(Date.now() / 1000) > exp) return null;
    return verifier;
  } catch {
    return null;
  }
}
