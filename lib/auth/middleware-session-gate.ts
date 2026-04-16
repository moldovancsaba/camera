/**
 * Edge middleware auth gate: supports legacy full-session JSON cookies and small `v:2` Mongo pointers.
 */

export type MiddlewareAuthGate =
  | { allow: true }
  | { allow: false; toLogin: boolean };

export function parseMiddlewareAuthGate(raw: string): MiddlewareAuthGate {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;

    if (obj.v === 2 && typeof obj.sid === 'string' && /^[a-f0-9]{64}$/.test(obj.sid)) {
      const expiresAtRaw = obj.expiresAt;
      if (typeof expiresAtRaw === 'string') {
        const now = new Date();
        const expiresAt = new Date(expiresAtRaw);
        if (Number.isFinite(expiresAt.getTime()) && now >= expiresAt) {
          return { allow: false, toLogin: true };
        }
      }
      if (obj.appAccess === false) {
        return { allow: false, toLogin: false };
      }
      const role = obj.appRole;
      if (role !== 'admin' && role !== 'superadmin') {
        return { allow: false, toLogin: false };
      }
      return { allow: true };
    }

    const session = obj as {
      expiresAt?: string;
      appRole?: string;
      appAccess?: boolean;
    };

    if (session.expiresAt) {
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      if (Number.isFinite(expiresAt.getTime()) && now >= expiresAt) {
        return { allow: false, toLogin: true };
      }
    }

    if (session.appAccess === false) {
      return { allow: false, toLogin: false };
    }

    const role = session.appRole;
    if (role !== 'admin' && role !== 'superadmin') {
      return { allow: false, toLogin: false };
    }

    return { allow: true };
  } catch {
    return { allow: false, toLogin: true };
  }
}
