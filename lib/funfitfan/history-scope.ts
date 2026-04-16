import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';

/** Mongo filter: this user’s FunFitFan reel + personal virtual event only (not other Camera events). */
export function personalHistorySubmissionMongoFilter(
  userId: string,
  personalEventUuid: string | null
): Record<string, unknown> {
  const submissionFilter: Record<string, unknown> = { userId };
  const u = personalEventUuid?.trim();
  if (u) {
    submissionFilter.$or = [
      { partnerId: FUNFITFAN_PARTNER_ID },
      { eventId: u },
      { eventIds: u },
    ];
  } else {
    submissionFilter.partnerId = FUNFITFAN_PARTNER_ID;
  }
  return submissionFilter;
}

/** Whether a submission document belongs on the unified FFF History page. */
export function submissionIsPersonalFffHistory(
  doc: { partnerId?: unknown; eventId?: unknown; eventIds?: unknown },
  personalEventUuid: string | null
): boolean {
  if (typeof doc.partnerId === 'string' && doc.partnerId === FUNFITFAN_PARTNER_ID) {
    return true;
  }
  const u = personalEventUuid?.trim();
  if (!u) return false;
  if (typeof doc.eventId === 'string' && doc.eventId === u) return true;
  const ids = doc.eventIds;
  if (Array.isArray(ids) && ids.some((x) => typeof x === 'string' && x === u)) return true;
  return false;
}
