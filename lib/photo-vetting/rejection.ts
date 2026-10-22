import { optionsOf, type ResolvedVocabulary } from './vocabulary';

/** Maximum free-text explanation on a rejection. */
export const MAX_NOTE_LENGTH = 500;

/** Keys the event currently offers for a photo rejection. */
export const offeredReasons = (vocabulary: ResolvedVocabulary): string[] => optionsOf(vocabulary, 'reject_reason').map((option) => option.key);

/** Keep selected rejection reasons in the event's configured order and discard stale keys. */
export function chosenReasons(reasons: readonly string[], vocabulary: ResolvedVocabulary): string[] {
  const chosen = new Set(reasons);
  return offeredReasons(vocabulary).filter((key) => chosen.has(key));
}

/** Toggle a rejection reason in the current selection. */
export const toggleReason = (reasons: readonly string[], key: string): string[] => (reasons.includes(key) ? reasons.filter((item) => item !== key) : [...reasons, key]);
