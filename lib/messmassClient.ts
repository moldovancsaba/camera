/**
 * Client for pushing camera-native partner data back to messmass -- the
 * reverse of messmass's lib/cameraClient.ts (which calls camera's
 * /api/internal/messmass/* routes). Auth reuses the SAME shared secret both
 * directions (CAMERA_MESSMASS_INTERNAL_SECRET); only messmass's base URL is new.
 *
 * LOOP SAFETY: only called from camera's own native partner routes.
 * - Create (app/api/partners/route.ts POST) pushes unconditionally: a partner
 *   created through camera's admin UI has no `source` field, so it is
 *   camera-native by construction and there is nothing to check.
 * - Update (app/api/partners/[partnerId]/route.ts PATCH) pushes only when
 *   `existingPartner.source !== 'messmass'`; that is where the guard lives,
 *   because an existing partner may have been provisioned from messmass.
 * Never called from app/api/internal/messmass/partners/route.ts (the inbound
 * receiver; lib/messmass/provision.ts stamps `source: 'messmass'` on every
 * partner it creates), so a partner synced messmass -> camera can never
 * round-trip back.
 */
import { fetchBounded, logOutbound } from '@/lib/observability/outbound';

function base(): string {
  return (process.env.MESSMASS_BASE_URL || '').replace(/\/$/, '');
}
function token(): string {
  return process.env.CAMERA_MESSMASS_INTERNAL_SECRET || '';
}
export function messmassConfigured(): boolean {
  return Boolean(process.env.MESSMASS_BASE_URL && process.env.CAMERA_MESSMASS_INTERNAL_SECRET);
}

// WHY: pushSsoSessionToMessmass is awaited on every camera login. A slow or
//     hung messmass must cost the user at most this long; on timeout the push
//     is treated like any other failure (null, no messmass session).
const SSO_SESSION_PUSH_TIMEOUT_MS = 3000;

// WHY: a partner create or update waits for this push, but the partner is already saved and a cold messmass can take
//     longer than the login push is allowed; so a more generous, still fixed, deadline. On timeout the partner is
//     simply not linked yet and the next update pushes it again (issue 178).
export const PARTNER_PUSH_TIMEOUT_MS = 8000;

/**
 * WHAT: Best-effort cross-app login -- forwards the SSO tokens camera just
 *     received to messmass's /api/integrations/camera/sso-session, which
 *     independently re-verifies them against SSO and mints a REAL messmass
 *     session if the user has messmass access. Returns the Set-Cookie
 *     header(s) messmass produced (to be appended onto camera's own
 *     response), or null if messmass is unconfigured, unreachable, or the
 *     user doesn't have messmass access -- all non-fatal, never throws.
 * WHY: Sibling of messmass's lib/cameraClient.ts:pushSsoSessionToCamera --
 *     together they make login from EITHER app cover both, as long as
 *     SESSION_COOKIE_DOMAIN=.messmass.com is set here so camera_session is
 *     itself visible on messmass's host too.
 *
 * Every attempt writes one `messmass.session_push` log line with its outcome (issue 178), so the keep-or-drop
 * decision has numbers: `ok` (messmass sent a session cookie), `empty` (it answered 2xx but sent none),
 * `refused` (an error status such as the expected 403 for a user without messmass access), `timeout` and `failed`.
 * The line holds the status and the time taken, never a token, a cookie or the user.
 */
export async function pushSsoSessionToMessmass(
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  },
  timeoutMs: number = SSO_SESSION_PUSH_TIMEOUT_MS
): Promise<string[] | null> {
  if (!messmassConfigured()) return null;
  const started = Date.now();
  try {
    const res = await fetchBounded(
      'messmass.session_push',
      'messmass session push',
      `${base()}/api/integrations/camera/sso-session`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-camera-secret': token(),
          authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
        }),
      },
      timeoutMs
    );
    const durationMs = Date.now() - started;
    if (!res.ok) {
      logOutbound('messmass.session_push', 'refused', { status: res.status, durationMs, timeoutMs });
      return null;
    }
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    // A 2xx without a cookie is not a session: it is counted apart so "ok" means a user really got one.
    if (!cookies.length) {
      logOutbound('messmass.session_push', 'empty', { status: res.status, durationMs, timeoutMs });
      return null;
    }
    logOutbound('messmass.session_push', 'ok', { status: res.status, durationMs, timeoutMs, cookies: cookies.length });
    return cookies;
  } catch {
    // fetchBounded has already logged the timeout or the failure.
    return null;
  }
}

/**
 * Pushes one camera-native partner to messmass and returns the id messmass gave it, or null when messmass is
 * unconfigured, unreachable, slow (`PARTNER_PUSH_TIMEOUT_MS`) or refuses. Never throws. One `messmass.partner_push`
 * log line per attempt: the outcome, status and time, and the camera partner id (a technical id; no name, no logo address).
 */
export async function pushPartnerToMessmass(
  input: {
    cameraPartnerId: string;
    name: string;
    logoUrl?: string;
  },
  timeoutMs: number = PARTNER_PUSH_TIMEOUT_MS
): Promise<{ id: string } | null> {
  if (!messmassConfigured()) return null;
  const started = Date.now();
  try {
    const res = await fetchBounded(
      'messmass.partner_push',
      'messmass partner push',
      `${base()}/api/integrations/camera/partners`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-camera-secret': token(),
          authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify(input),
      },
      timeoutMs
    );
    const durationMs = Date.now() - started;
    const partnerId = input.cameraPartnerId;
    if (!res.ok) {
      logOutbound('messmass.partner_push', 'refused', { status: res.status, durationMs, timeoutMs, partnerId });
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as { partner?: { id?: string } };
    const id = json?.partner?.id;
    logOutbound('messmass.partner_push', 'ok', { status: res.status, durationMs, timeoutMs, partnerId, linked: typeof id === 'string' && Boolean(id) });
    return typeof id === 'string' && id ? { id } : null;
  } catch {
    // fetchBounded has already logged the timeout or the failure.
    return null;
  }
}

// WHY: the frame context is read when an event is provisioned and when an admin presses refresh, so a slow or
//     hung messmass must cost at most this long; on timeout it is treated like any other failure (null).
const FRAME_CONTEXT_TIMEOUT_MS = 5000;

/**
 * The resolved theme of one messmass event for the generated default frame (messmass GET
 * /api/integrations/camera/events/[id]/frame-context, camera#231): teams with logos, partner, template and
 * effective style. Returns the raw JSON (parsed and validated by lib/frame/context.ts) or null when messmass is
 * unconfigured, unreachable, slow, or does not know the event. Never throws.
 */
export async function fetchFrameContext(messmassEventId: string, timeoutMs: number = FRAME_CONTEXT_TIMEOUT_MS): Promise<unknown | null> {
  if (!messmassConfigured() || !/^[0-9a-f]{24}$/i.test(messmassEventId)) return null;
  try {
    const res = await fetch(`${base()}/api/integrations/camera/events/${messmassEventId}/frame-context`, {
      headers: { 'x-camera-secret': token(), authorization: `Bearer ${token()}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// WHY: the push runs after a visit has been redirected, so a slow messmass must not hold the function for long; a timeout is a failed push and the
//     next one repeats it (messmass takes whole totals, so a repeat is harmless).
const LINK_STATS_TIMEOUT_MS = 5000;

/**
 * Sends the scan and click totals of an event's tracked short links (messmass POST /api/integrations/camera/events/[id]/link-stats, camera#320).
 * True when messmass accepted them; false when it is unconfigured, unreachable, slow or refuses. Never throws.
 */
export async function pushLinkStatsToMessmass(
  messmassEventId: string,
  totals: { visitQrCode: number; visitShortUrl: number; qrscanAndroid: number; qrscanIphone: number },
  timeoutMs: number = LINK_STATS_TIMEOUT_MS,
): Promise<boolean> {
  if (!messmassConfigured() || !/^[0-9a-f]{24}$/i.test(messmassEventId)) return false;
  try {
    const res = await fetch(`${base()}/api/integrations/camera/events/${messmassEventId}/link-stats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-camera-secret': token(), authorization: `Bearer ${token()}` },
      body: JSON.stringify({ totals }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Absolute URL of a font file on the messmass origin (a `/fonts/...` path from the frame context), or null when messmass is not configured. */
export function messmassFontUrl(fontPath: string): string | null {
  const origin = base();
  return origin && fontPath.startsWith('/fonts/') ? `${origin}${encodeURI(fontPath)}` : null;
}
