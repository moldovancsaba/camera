/**
 * The stores of the legal part of the e-mails (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E2): the general setting, the partner's and the event's, read and written. The rules (checks,
 * levels, the standard line) are in legal-rules.ts and re-exported here. Server side; unit-tested in legal.test.ts with a fake database.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { UiLanguage } from '@/lib/i18n';
import { eventLanguage } from '@/lib/i18n/overrides';
import { resolveLegal, storedLegal, type LegalByLanguage, type LegalLevels, type LegalSource } from '@/lib/email/legal-rules';

export * from '@/lib/email/legal-rules';

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The stores
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const GLOBAL_SETTING = 'email-legal';

export async function getGlobalLegal(db: Db): Promise<LegalByLanguage> {
  const stored = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: GLOBAL_SETTING });
  return storedLegal(stored?.legal);
}

export async function saveGlobalLegal(db: Db, legal: LegalByLanguage, updatedBy: string | null, now: string): Promise<void> {
  await db.collection(COLLECTIONS.ADMIN_SETTINGS).updateOne({ settingId: GLOBAL_SETTING }, { $set: { settingId: GLOBAL_SETTING, legal, updatedAt: now, updatedBy } }, { upsert: true });
}

export async function savePartnerLegal(db: Db, partnerId: string, legal: LegalByLanguage, now: string): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.PARTNERS).updateOne({ partnerId }, { $set: { emailLegal: legal, updatedAt: now } });
  return result.matchedCount > 0;
}

export async function saveEventLegal(db: Db, eventId: string, legal: LegalByLanguage, now: string): Promise<boolean> {
  const result = await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId }, { $set: { emailLegal: legal, updatedAt: now } });
  return result.matchedCount > 0;
}

export interface EventLegal {
  language: UiLanguage;
  levels: LegalLevels;
  /** What applies to the event in its language, and the level it comes from; null when there is none. */
  effective: { text: string; source: LegalSource } | null;
  partner: Document | null;
}

/** The legal part of an event, level by level and resolved for its language. Two reads (the general setting and the partner), none written. */
export async function loadEventLegal(db: Db, event: Document, partner?: Document | null): Promise<EventLegal> {
  const partnerDoc = partner === undefined ? (typeof event.partnerId === 'string' && event.partnerId ? await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId: event.partnerId }) : null) : partner;
  const language = eventLanguage(event, partnerDoc);
  const levels: LegalLevels = { global: await getGlobalLegal(db), partner: storedLegal(partnerDoc?.emailLegal), event: storedLegal(event.emailLegal) };
  return { language, levels, effective: resolveLegal(language, levels), partner: partnerDoc ?? null };
}
