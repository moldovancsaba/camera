/**
 * The database side of the annotation vocabulary (issue 628, lib/photo-vetting/vocabulary.ts): where each level keeps what its editor changed, and the one function that turns them into
 * the list an event works with.
 *
 * - **general:** the `admin_settings` document `settingId: 'annotation-vocabulary'` (`{ options: [...] }`), set by global admins.
 * - **partner:** `Partner.annotationVocabulary`.
 * - **event:** `Event.annotationVocabulary`.
 *
 * Nothing is stored where nobody changed anything, so every event reads the standard list until somebody does. A level that is damaged reads as unchanged (vocabulary.ts leaves out what is
 * not valid), so the vetting screen never goes down because of a bad value.
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { resolveVocabulary, type ResolvedVocabulary } from './vocabulary';

export const GENERAL_VOCABULARY_SETTING_ID = 'annotation-vocabulary';

/** The general level as stored (or nothing). */
export async function loadGeneralVocabularyLevel(db: Db): Promise<unknown> {
  const stored = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne({ settingId: GENERAL_VOCABULARY_SETTING_ID }, { projection: { options: 1 } });
  return stored ? { options: stored.options } : undefined;
}

/** The partner's level as stored (or nothing). */
export async function loadPartnerVocabularyLevel(db: Db, partnerId: unknown): Promise<unknown> {
  if (!partnerId) return undefined;
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ partnerId }, { projection: { annotationVocabulary: 1 } });
  return partner?.annotationVocabulary;
}

/** The list an event works with: the standard list under the general level, the partner's and the event's own. `event` is the stored event document (or just the fields used). */
export async function loadEventVocabulary(db: Db, event: Record<string, unknown> | null | undefined): Promise<ResolvedVocabulary> {
  const [general, partner] = await Promise.all([loadGeneralVocabularyLevel(db), loadPartnerVocabularyLevel(db, event?.partnerId)]);
  return resolveVocabulary({ general, partner, event: event?.annotationVocabulary });
}
