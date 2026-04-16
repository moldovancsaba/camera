/**
 * FunFitFan browser paths on FFF hostnames (fff.*, funfitfan.*).
 * Middleware rewrites these to the internal `app/fff/*` tree; legacy `/fff/*` URLs redirect here.
 * Keeps the same Next.js codebase as Camera without exposing `/fff` in the address bar for FFF UX.
 */

export const fffBrowser = {
  home: '/',
  login: '/login',
  log: '/log',
  history: '/history',
  historySubmission: (id: string) => `/history/submission/${id}`,
  historyGym: (sessionId: string) => `/history/gym/${sessionId}`,
  reel: '/reel',
  sharePath: (token: string) => `/share/${encodeURIComponent(token)}`,
} as const;

/** Absolute share URL for the current FFF deployment (caller passes origin, e.g. from headers). */
export function fffShareAbsoluteUrl(siteOrigin: string, token: string): string {
  const base = siteOrigin.replace(/\/$/, '');
  return `${base}${fffBrowser.sharePath(token)}`;
}

/** `/fff/foo` → `/foo` for canonical redirects on FFF hosts (manifest is served without middleware). */
export function fffHostLegacyPathRedirectTarget(pathname: string): string | null {
  if (!pathname.startsWith('/fff/')) return null;
  return pathname.replace(/^\/fff/, '') || '/';
}

/**
 * Map public FFF paths (no `/fff` prefix) to internal `app/fff/*` paths. Returns null if no mapping.
 */
export function fffPublicUrlToInternalPath(pathname: string): string | null {
  if (pathname === '/login') return '/fff/login';
  if (pathname === '/log') return '/fff/log';
  if (pathname === '/reel') return '/fff/reel';
  if (pathname === '/history' || pathname.startsWith('/history/')) {
    return `/fff${pathname}`;
  }
  if (pathname.startsWith('/share/')) {
    return `/fff${pathname}`;
  }
  return null;
}
