import type { Db } from 'mongodb';
import { isUiLanguage, type UiLanguage } from '@/lib/i18n';
import { COLLECTIONS, type AdminUserPreferences } from '@/lib/db/schemas';

export type AdminUiLanguagePreference = UiLanguage | null;

/**
 * Read just the setting for the authenticated SSO subject. A missing or
 * obsolete value means “Use device language”; the record never stores profile
 * details such as name or e-mail.
 */
export async function readAdminUiLanguagePreference(db: Db, ssoUserId: string): Promise<AdminUiLanguagePreference> {
  const row = await db.collection<AdminUserPreferences>(COLLECTIONS.ADMIN_USER_PREFERENCES).findOne(
    { _id: ssoUserId },
    { projection: { uiLanguage: 1 } },
  );
  return isUiLanguage(row?.uiLanguage) ? row.uiLanguage : null;
}

/** Persist a user's own preference under the SSO subject, atomically. */
export async function saveAdminUiLanguagePreference(
  db: Db,
  ssoUserId: string,
  uiLanguage: AdminUiLanguagePreference,
  now = new Date().toISOString(),
): Promise<void> {
  await db.collection<AdminUserPreferences>(COLLECTIONS.ADMIN_USER_PREFERENCES).updateOne(
    { _id: ssoUserId },
    {
      $set: { uiLanguage, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

/** The PATCH body intentionally accepts only one field and never an identity key. */
export function parseAdminUiLanguagePreferenceBody(value: unknown):
  | { ok: true; uiLanguage: AdminUiLanguagePreference }
  | { ok: false } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'uiLanguage')) return { ok: false };
  if (body.uiLanguage === null || isUiLanguage(body.uiLanguage)) {
    return { ok: true, uiLanguage: body.uiLanguage };
  }
  return { ok: false };
}
