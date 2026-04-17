/**
 * Short links on GO_SHORT_HOSTNAMES (e.g. go.messmass.com/selfie → event capture).
 */

/** Lowercase slug: 2–63 chars, letters/digits/hyphens, no leading/trailing hyphen. */
export const GO_SHORT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** First path segments that must not be treated as event slugs (app routes + API). */
const RESERVED_GO_SLUGS = new Set([
  'api',
  '_next',
  'static',
  'admin',
  'capture',
  'share',
  'fff',
  'profile',
  'slideshow',
  'slideshow-layout',
  'users',
  'workout',
  'login',
  'log',
  'history',
  'reel',
  'submissions',
  'partners',
  'events',
  'frames',
  'logos',
  'upload-logo',
  'auth',
  'sso',
  'training',
  'session',
  'favicon.ico',
]);

export function isReservedGoShortSlug(slug: string): boolean {
  return RESERVED_GO_SLUGS.has(slug.toLowerCase());
}

export type GoShortSlugNormalizeResult =
  | { ok: true; slug: string | null }
  | { ok: false; error: string };

/**
 * Normalize admin/API input: trim, lowercase, empty string → clear (null).
 */
export function normalizeGoShortSlugInput(raw: unknown): GoShortSlugNormalizeResult {
  if (raw === undefined || raw === null) return { ok: true, slug: null };
  const s = String(raw).trim().toLowerCase();
  if (!s) return { ok: true, slug: null };
  if (s.length < 2 || s.length > 63) {
    return { ok: false, error: 'Short link slug must be between 2 and 63 characters.' };
  }
  if (!GO_SHORT_SLUG_PATTERN.test(s)) {
    return {
      ok: false,
      error:
        'Slug may only use lowercase letters, digits, and hyphens (not at the start or end).',
    };
  }
  if (isReservedGoShortSlug(s)) {
    return { ok: false, error: 'This slug is reserved. Choose another.' };
  }
  return { ok: true, slug: s };
}

/**
 * If `pathname` is a single non-reserved segment suitable for lookup, return it; else null.
 */
export function goShortSlugFromPathname(pathname: string): string | null {
  if (!pathname || pathname === '/') return null;
  const trimmed = pathname.replace(/^\/+|\/+$/g, '');
  if (!trimmed || trimmed.includes('/')) return null;
  const lower = trimmed.toLowerCase();
  if (!GO_SHORT_SLUG_PATTERN.test(lower)) return null;
  if (isReservedGoShortSlug(lower)) return null;
  return lower;
}
