/**
 * Client for pushing camera-native partner data back to messmass -- the
 * reverse of messmass's lib/cameraClient.ts (which calls camera's
 * /api/internal/messmass/* routes). Auth reuses the SAME shared secret both
 * directions (CAMERA_MESSMASS_INTERNAL_SECRET); only messmass's base URL is new.
 *
 * LOOP SAFETY: only called from camera's own native partner create/update
 * routes (app/api/partners/route.ts, app/api/partners/[partnerId]/route.ts),
 * and only for partners where source !== 'messmass'. Never called from
 * app/api/internal/messmass/partners/route.ts (the inbound receiver), so a
 * partner synced messmass -> camera can never round-trip back.
 */
function base(): string {
  return (process.env.MESSMASS_BASE_URL || '').replace(/\/$/, '');
}
function token(): string {
  return process.env.CAMERA_MESSMASS_INTERNAL_SECRET || '';
}
export function messmassConfigured(): boolean {
  return Boolean(process.env.MESSMASS_BASE_URL && process.env.CAMERA_MESSMASS_INTERNAL_SECRET);
}

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
 */
export async function pushSsoSessionToMessmass(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): Promise<string[] | null> {
  if (!messmassConfigured()) return null;
  try {
    const res = await fetch(`${base()}/api/integrations/camera/sso-session`, {
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
    });
    if (!res.ok) return null;
    const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return cookies.length ? cookies : null;
  } catch {
    return null;
  }
}

export async function pushPartnerToMessmass(input: {
  cameraPartnerId: string;
  name: string;
  logoUrl?: string;
}): Promise<{ id: string } | null> {
  if (!messmassConfigured()) return null;
  try {
    const res = await fetch(`${base()}/api/integrations/camera/partners`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-camera-secret': token(),
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { partner?: { id?: string } };
    const id = json?.partner?.id;
    return typeof id === 'string' && id ? { id } : null;
  } catch {
    return null;
  }
}
