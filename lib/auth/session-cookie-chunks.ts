/**
 * Split `camera_session` across multiple cookies when JSON exceeds browser per-cookie limits
 * (~4KB in Chrome). Middleware and getSession() must use the same merge rules.
 */

export const SESSION_COOKIE_NAME = 'camera_session';
/** Max extra cookies `camera_session_1` … (exclusive of primary). */
export const SESSION_COOKIE_MAX_CHUNKS = 24;

const SPLIT_PREFIX = 'SPLIT1:';

function base64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (b64.length % 4)) % 4;
  const pad = '='.repeat(padLen);
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Returns merged session JSON string, or null if cookies are missing/invalid.
 * `get` reads one cookie value by name (e.g. request.cookies.get(name)?.value).
 */
export function readSerializedSessionFromCookieGet(get: (name: string) => string | undefined): string | null {
  const primary = get(SESSION_COOKIE_NAME);
  if (primary == null || primary === '') return null;

  if (!primary.startsWith(SPLIT_PREFIX)) {
    return primary;
  }

  const without = primary.slice(SPLIT_PREFIX.length);
  const colon = without.indexOf(':');
  if (colon <= 0) return null;
  const n = parseInt(without.slice(0, colon), 10);
  const firstChunk = without.slice(colon + 1);
  if (!Number.isFinite(n) || n < 1 || n > SESSION_COOKIE_MAX_CHUNKS + 1) return null;
  if (firstChunk === '') return null;

  let b64 = firstChunk;
  for (let i = 1; i < n; i++) {
    const part = get(`${SESSION_COOKIE_NAME}_${i}`);
    if (part === undefined || part === '') return null;
    b64 += part;
  }

  try {
    return base64UrlToUtf8(b64);
  } catch {
    return null;
  }
}

export function chunkCookieSuffixesToClear(): string[] {
  const names: string[] = [];
  for (let i = 1; i <= SESSION_COOKIE_MAX_CHUNKS; i++) {
    names.push(`${SESSION_COOKIE_NAME}_${i}`);
  }
  return names;
}
