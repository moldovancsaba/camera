/**
 * Edge middleware auth gate: supports legacy full-session JSON cookies and small `v:2` Mongo pointers.
 *
 * WHAT: Only gates on session presence/expiry, never on the pointer cookie's
 *     cached `appAccess` field.
 * WHY: The `v:2` pointer's `appAccess` is a snapshot taken at login
 *     (createSession()/saveWebSessionDocument()) and never refreshed for
 *     the life of that 30-day session. If a user's access is granted or
 *     revoked after they logged in, this cached value goes stale while
 *     `getSession()` (used by both /api/auth/session and
 *     app/admin/layout.tsx) keeps reading the live value from the
 *     Mongo-backed session document -- the two disagreeing produced a real
 *     infinite reload loop: /admin/login's client-side check trusts the
 *     live "you have access" answer and navigates to /admin, the edge gate
 *     trusts the stale "no access" cookie and bounces it straight back to
 *     /admin/login?error=no_access, which re-checks and repeats forever.
 *     Access denial is still fully enforced -- app/admin/layout.tsx's own
 *     `session.appAccess === false` check (backed by the same live
 *     getSession() read) still redirects a genuinely-denied session to
 *     NO_ACCESS_REDIRECT. This just moves *that* decision to the one place
 *     with live data instead of also making it here from a snapshot.
 */

export type MiddlewareAuthGate = { allow: boolean };

export function parseMiddlewareAuthGate(raw: string): MiddlewareAuthGate {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;

    if (obj.v === 2 && typeof obj.sid === 'string' && /^[a-f0-9]{64}$/.test(obj.sid)) {
      const expiresAtRaw = obj.expiresAt;
      if (typeof expiresAtRaw === 'string') {
        const now = new Date();
        const expiresAt = new Date(expiresAtRaw);
        if (Number.isFinite(expiresAt.getTime()) && now >= expiresAt) {
          return { allow: false };
        }
      }
      return { allow: true };
    }

    const session = obj as { expiresAt?: string };

    if (session.expiresAt) {
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      if (Number.isFinite(expiresAt.getTime()) && now >= expiresAt) {
        return { allow: false };
      }
    }

    return { allow: true };
  } catch {
    return { allow: false };
  }
}
