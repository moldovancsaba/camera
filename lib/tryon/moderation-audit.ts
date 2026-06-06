import type { Db } from 'mongodb';
import {
  COLLECTIONS,
  type Submission,
  type TryOnModerationAction,
  type TryOnModerationEvent,
  type TryOnModerationStateSnapshot,
} from '@/lib/db/schemas';
import { nowIso } from '@/lib/tryon/time';

export type ModerationAuditSummary = Pick<
  TryOnModerationEvent,
  'eventId' | 'action' | 'actorEmail' | 'createdAt' | 'previousState' | 'nextState' | 'reason'
>;

export function snapshotTryOnModerationState(
  submission: Submission,
  overrides: Partial<TryOnModerationStateSnapshot> = {}
): TryOnModerationStateSnapshot {
  const metadata = submission.metadata && typeof submission.metadata === 'object'
    ? submission.metadata as Record<string, unknown>
    : {};
  return {
    reviewStatus: submission.reviewStatus ?? null,
    archiveBucket: submission.tryOnModerationArchive?.bucket ?? null,
    archived: submission.tryOnModerationArchive?.archived ?? null,
    shareVisible: submission.isShareVisible ?? null,
    slideshowEligible: submission.isSlideshowEligible ?? null,
    isGreat: Boolean(metadata.tryOnGreat),
    isService: Boolean(metadata.tryOnService),
    ...overrides,
  };
}

export async function appendTryOnModerationEvent(
  db: Db,
  input: {
    resultSubmissionId: string;
    resultSubmission: Submission;
    action: TryOnModerationAction;
    actorEmail: string | null | undefined;
    previousState?: TryOnModerationStateSnapshot;
    nextState: TryOnModerationStateSnapshot;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<TryOnModerationEvent> {
  const createdAt = nowIso();
  const event: TryOnModerationEvent = {
    eventId: `${input.resultSubmissionId}:${input.action}:${createdAt}`,
    resultSubmissionId: input.resultSubmissionId,
    sourceSubmissionId: input.resultSubmission.sourceSubmissionId ?? null,
    sourceJobId: input.resultSubmission.sourceJobId ?? null,
    action: input.action,
    actorEmail: input.actorEmail?.trim() || 'unknown-admin',
    createdAt,
    previousState: input.previousState ?? snapshotTryOnModerationState(input.resultSubmission),
    nextState: input.nextState,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  };

  await db.collection<TryOnModerationEvent>(COLLECTIONS.TRYON_MODERATION_EVENTS).insertOne(event);
  return event;
}

export async function listTryOnModerationEvents(
  db: Db,
  resultSubmissionId: string,
  limit = 20
): Promise<ModerationAuditSummary[]> {
  const events = await db
    .collection<TryOnModerationEvent>(COLLECTIONS.TRYON_MODERATION_EVENTS)
    .find({ resultSubmissionId })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(50, limit)))
    .toArray();

  return events.map((event) => ({
    eventId: event.eventId,
    action: event.action,
    actorEmail: event.actorEmail,
    createdAt: event.createdAt,
    previousState: event.previousState,
    nextState: event.nextState,
    reason: event.reason ?? null,
  }));
}
