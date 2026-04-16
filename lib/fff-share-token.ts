/**
 * Signed, time-limited tokens for public FunFitFan share links (submission image or gym session).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const HMAC_ALG = 'sha256';

export type FffShareTokenKind = 'sub' | 'gym';

export type FffSharePayload = {
  k: FffShareTokenKind;
  /** Mongo ObjectId string (submission) or gym sessionId UUID */
  id: string;
  /** Unix ms expiry */
  exp: number;
};

export function getFffShareLinkSecret(): string {
  const s = process.env.FFF_SHARE_LINK_SECRET?.trim();
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[fff-share] FFF_SHARE_LINK_SECRET is not set (min 16 chars). Share links use a weak fallback; set the env var in production.'
    );
  }
  return 'dev-funfitfan-share-link-not-for-production';
}

export function signFffSharePayload(payload: FffSharePayload, secret: string = getFffShareLinkSecret()): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac(HMAC_ALG, secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyFffShareToken(
  token: string,
  secret: string = getFffShareLinkSecret()
): FffSharePayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return null;
  const expected = createHmac(HMAC_ALG, secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  try {
    const raw = Buffer.from(body, 'base64url').toString('utf8');
    const payload = JSON.parse(raw) as FffSharePayload;
    if (payload.k !== 'sub' && payload.k !== 'gym') return null;
    if (typeof payload.id !== 'string' || !payload.id.trim()) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
