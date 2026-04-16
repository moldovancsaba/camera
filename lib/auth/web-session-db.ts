/**
 * Persists large OAuth/session payloads in MongoDB so the browser only stores a small
 * pointer in `camera_session` (Chrome per-cookie limits, Set-Cookie reliability).
 */

import crypto from 'crypto';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

/** Stored payload (same shape as `Session` in session.ts; kept local to avoid import cycles). */
export type StoredWebSession = {
  user: { id: string; email: string; name?: string; email_verified?: boolean; role?: string };
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  createdAt: string;
  expiresAt: string;
  appRole?: 'none' | 'user' | 'admin' | 'superadmin';
  appAccess?: boolean;
};

export const WEB_SESSION_POINTER_VERSION = 2 as const;

export type WebSessionPointerCookie = {
  v: typeof WEB_SESSION_POINTER_VERSION;
  sid: string;
  expiresAt: string;
  appRole?: StoredWebSession['appRole'];
  appAccess?: boolean;
};

export function isWebSessionPointer(obj: unknown): obj is WebSessionPointerCookie {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    o.v === WEB_SESSION_POINTER_VERSION &&
    typeof o.sid === 'string' &&
    /^[a-f0-9]{64}$/.test(o.sid) &&
    typeof o.expiresAt === 'string'
  );
}

export function useMongoWebSessions(): boolean {
  if (process.env.COOKIE_ONLY_SESSIONS === '1') return false;
  return Boolean(process.env.MONGODB_URI?.trim() && process.env.MONGODB_DB?.trim());
}

export async function saveWebSessionDocument(session: StoredWebSession): Promise<WebSessionPointerCookie> {
  const db = await connectToDatabase();
  const sid = crypto.randomBytes(32).toString('hex');
  const expireAt = new Date(session.expiresAt);
  await db.collection(COLLECTIONS.WEB_SESSIONS).insertOne({
    sid,
    expireAt,
    session,
    createdAt: new Date(),
  });
  return {
    v: WEB_SESSION_POINTER_VERSION,
    sid,
    expiresAt: session.expiresAt,
    appRole: session.appRole,
    appAccess: session.appAccess,
  };
}

export async function loadWebSessionDocument(sid: string): Promise<StoredWebSession | null> {
  const db = await connectToDatabase();
  const doc = await db.collection(COLLECTIONS.WEB_SESSIONS).findOne<{ session: StoredWebSession }>({ sid });
  if (!doc?.session) return null;
  const now = new Date();
  const expiresAt = new Date(doc.session.expiresAt);
  if (now >= expiresAt) {
    await db.collection(COLLECTIONS.WEB_SESSIONS).deleteOne({ sid }).catch(() => {});
    return null;
  }
  return doc.session;
}

export async function removeWebSessionDocument(sid: string): Promise<void> {
  try {
    const db = await connectToDatabase();
    await db.collection(COLLECTIONS.WEB_SESSIONS).deleteOne({ sid });
  } catch {
    /* ignore */
  }
}
