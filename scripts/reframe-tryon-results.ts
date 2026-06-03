/**
 * Backfill utility for existing try-on result submissions.
 *
 * Usage:
 *   npx tsx scripts/reframe-tryon-results.ts
 *   npx tsx scripts/reframe-tryon-results.ts --dry-run
 *   npx tsx scripts/reframe-tryon-results.ts --limit=50 --event=<eventId or event _id>
 *   npx tsx scripts/reframe-tryon-results.ts --source-submission-id=<submissionObjectId>
 */

import { ObjectId, type Document } from 'mongodb';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { applyFrameToTryOnResult } from '@/lib/tryon/frame-composition';
import { COLLECTIONS, type Event, type Submission, type TryOnJob } from '@/lib/db/schemas';
import { loadEnvFromFiles } from './load-env-from-files';
import { nowIso } from '@/lib/tryon/time';

interface ReframeOptions {
  dryRun: boolean;
  limit: number | null;
  eventFilter?: string;
  sourceSubmissionId?: string;
}

interface ReframeResult {
  status: 'updated' | 'skipped' | 'failed';
  reason?: string;
  submissionId: string;
  message?: string;
}

interface ScriptCounters {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
}

interface TryOnCandidateSubmission {
  _id: ObjectId;
  imageUrl?: string;
  deleteUrl?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  sourceSubmissionId?: string | null;
  sourceJobId?: string | null;
  metadata?: {
    compositionEngine?: string;
    tryOnRawResultUrl?: string | null;
    finalWidth?: number;
    finalHeight?: number;
    [key: string]: unknown;
  };
  eventId?: string | null;
  eventIds?: string[];
}

interface SourceSubmissionSnapshot {
  _id: ObjectId;
  frameId?: string | null;
  eventId?: string | null;
  eventIds?: string[];
  tryOnJobs?: Array<{
    jobId?: string | null;
    [key: string]: unknown;
  }> | null;
}

interface ResolvedEventProfile {
  _id: ObjectId | string;
  shouldApplyReturnedFrame: boolean;
}

type FrameRecord = {
  fileUrl?: string | null;
  imageUrl?: string | null;
};

function resolveFrameAssetUrl(frame: FrameRecord): string | null {
  const legacyUrl = typeof frame.fileUrl === 'string' ? frame.fileUrl.trim() : '';
  if (legacyUrl) return legacyUrl;

  const currentUrl = typeof frame.imageUrl === 'string' ? frame.imageUrl.trim() : '';
  return currentUrl || null;
}

function parseArgs(): ReframeOptions {
  const args = process.argv.slice(2);
  const eventArg = args.find((value) => value.startsWith('--event='));
  const sourceArg = args.find((value) => value.startsWith('--source-submission-id='));
  const limitArg = args.find((value) => value.startsWith('--limit='));

  const rawLimit = limitArg ? Number.parseInt(limitArg.replace('--limit=', ''), 10) : NaN;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;

  return {
    dryRun: args.includes('--dry-run'),
    limit,
    eventFilter: eventArg?.replace('--event=', '').trim(),
    sourceSubmissionId: sourceArg?.replace('--source-submission-id=', '').trim(),
  };
}

function toMongoId(value: unknown): ObjectId | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!ObjectId.isValid(trimmed)) return null;
  return new ObjectId(trimmed);
}

function buildEventFilterClause(eventFilter: string | undefined): Document[] {
  if (!eventFilter) return [];
  const normalized = eventFilter.trim();
  if (!normalized) return [];
  const clauses: Document[] = [{ eventId: normalized }, { sourceSubmissionId: normalized }];

  if (ObjectId.isValid(normalized)) {
    clauses.push({ _id: new ObjectId(normalized) });
  }

  return clauses;
}

async function resolveSourceEventForReframe(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  sourceSubmission: SourceSubmissionSnapshot,
  sourceJob: TryOnJob | null,
  targetEventFilter?: string
) {
  const eventIdentifiers = new Set<string>();
  const sourceEventId = typeof sourceSubmission.eventId === 'string' ? sourceSubmission.eventId.trim() : '';

  if (sourceEventId) {
    eventIdentifiers.add(sourceEventId);
  }

  if (Array.isArray(sourceSubmission.eventIds)) {
    for (const value of sourceSubmission.eventIds) {
      if (typeof value === 'string' && value.trim()) {
        eventIdentifiers.add(value.trim());
      }
    }
  }

  if (sourceJob?.source.eventMongoId) {
    eventIdentifiers.add(String(sourceJob.source.eventMongoId));
  }

  if (targetEventFilter) {
    eventIdentifiers.add(targetEventFilter.trim());
  }

  const eventLookup: Document[] = [];
  for (const value of eventIdentifiers) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    eventLookup.push({ eventId: trimmed });
    if (ObjectId.isValid(trimmed)) {
      eventLookup.push({ _id: new ObjectId(trimmed) });
    }
  }

  if (!eventLookup.length) {
    return null;
  }

  const event = await db.collection<Event>(COLLECTIONS.EVENTS).findOne(
    { $or: eventLookup },
    { projection: { tryOn: 1, _id: 1 } }
  );

  if (!event) {
    return null;
  }

  return {
    _id: event._id,
    shouldApplyReturnedFrame: Boolean(event.tryOn?.applyFrameToReturnedResults),
  } satisfies ResolvedEventProfile;
}

async function buildCandidates(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  options: ReframeOptions
) {
  const filter: Document = {
    submissionKind: 'tryon_result',
    isArchived: { $ne: true },
    'metadata.compositionEngine': { $ne: 'motogp_leather_magic_framed' },
    sourceSubmissionId: { $type: 'string' },
    imageUrl: { $type: 'string' },
  };

  if (options.sourceSubmissionId) {
    if (!ObjectId.isValid(options.sourceSubmissionId)) {
      console.warn(`Invalid --source-submission-id "${options.sourceSubmissionId}"`);
      return [];
    }
    filter.sourceSubmissionId = options.sourceSubmissionId;
  }

  if (options.eventFilter) {
    const clauses = buildEventFilterClause(options.eventFilter);
    if (clauses.length) {
      filter.$or = clauses;
    }
  }

  const cursor = db
    .collection<TryOnCandidateSubmission>(COLLECTIONS.SUBMISSIONS)
    .find(filter)
    .project({
      imageUrl: 1,
      sourceJobId: 1,
      sourceSubmissionId: 1,
      metadata: 1,
      finalImageUrl: 1,
      deleteUrl: 1,
      fileSize: 1,
      mimeType: 1,
      eventId: 1,
      eventIds: 1,
      updatedAt: 1,
      createdAt: 1,
    });

  const candidates = options.limit ? await cursor.limit(options.limit).toArray() : await cursor.toArray();
  return candidates as TryOnCandidateSubmission[];
}

function matchesEventFilter(
  eventFilter: string | undefined,
  sourceSubmission: SourceSubmissionSnapshot,
  resolvedEvent: ResolvedEventProfile | null
) {
  if (!eventFilter) return true;
  const normalized = eventFilter.trim();
  if (!normalized) return true;

  const candidateEventIds = new Set<string>();
  if (sourceSubmission.eventId) candidateEventIds.add(sourceSubmission.eventId);
  if (Array.isArray(sourceSubmission.eventIds)) {
    for (const value of sourceSubmission.eventIds) {
      if (typeof value === 'string' && value.trim()) {
        candidateEventIds.add(value.trim());
      }
    }
  }
  const hasDirectMatch = candidateEventIds.has(normalized);
  const hasResolvedEventMatch =
    resolvedEvent !== null && String(resolvedEvent._id) === normalized;

  return hasDirectMatch || hasResolvedEventMatch;
}

async function reframeExistingTryOnResult(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  resultSubmission: TryOnCandidateSubmission,
  options: ReframeOptions
): Promise<ReframeResult> {
  const resultSubmissionId = resultSubmission._id?.toString() ?? 'unknown';
  const now = nowIso();

  if (!resultSubmission.imageUrl || typeof resultSubmission.imageUrl !== 'string') {
    return {
      status: 'skipped',
      reason: 'no_source_result_image',
      submissionId: resultSubmissionId,
    };
  }

  const sourceSubmissionObjectId = toMongoId(resultSubmission.sourceSubmissionId);
  if (!sourceSubmissionObjectId) {
    return {
      status: 'skipped',
      reason: 'missing_or_invalid_source_submission_id',
      submissionId: resultSubmissionId,
    };
  }

  const sourceSubmission = await db
    .collection<SourceSubmissionSnapshot>(COLLECTIONS.SUBMISSIONS)
    .findOne(
      { _id: sourceSubmissionObjectId },
      {
        projection: { frameId: 1, eventId: 1, eventIds: 1 },
      }
    );

  if (!sourceSubmission) {
    return {
      status: 'skipped',
      reason: 'missing_source_submission',
      submissionId: resultSubmissionId,
    };
  }

  if (!sourceSubmission.frameId || typeof sourceSubmission.frameId !== 'string') {
    return {
      status: 'skipped',
      reason: 'source_submission_missing_frame',
      submissionId: resultSubmissionId,
    };
  }

  const sourceJob = resultSubmission.sourceJobId
    ? await db
        .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
        .findOne(
          { jobId: resultSubmission.sourceJobId },
          { projection: { source: 1, request: 1, result: 1, jobId: 1, status: 1, stage: 1 } }
        )
    : null;

  const sourceEvent = await resolveSourceEventForReframe(
    db,
    sourceSubmission,
    sourceJob,
    options.eventFilter
  );

  if (!sourceEvent?.shouldApplyReturnedFrame) {
    return {
      status: 'skipped',
      reason: 'applyFrameToReturnedResults_disabled',
      submissionId: resultSubmissionId,
    };
  }

  if (!matchesEventFilter(options.eventFilter, sourceSubmission, sourceEvent)) {
    return {
      status: 'skipped',
      reason: 'event_filter_mismatch',
      submissionId: resultSubmissionId,
    };
  }

  const frame = await db.collection<FrameRecord>(COLLECTIONS.FRAMES).findOne(
    { frameId: sourceSubmission.frameId },
    { projection: { fileUrl: 1, imageUrl: 1 } }
  );

  const frameAssetUrl = frame ? resolveFrameAssetUrl(frame) : null;
  if (!frameAssetUrl) {
    return {
      status: 'skipped',
      reason: 'frame_file_missing',
      submissionId: resultSubmissionId,
    };
  }

  const currentEngine = resultSubmission.metadata?.compositionEngine;
  const alreadyFramed = currentEngine === 'motogp_leather_magic_framed';
  if (alreadyFramed && !options.dryRun) {
    return {
      status: 'skipped',
      reason: 'already_framed',
      submissionId: resultSubmissionId,
    };
  }

  const baseRawUrl = typeof resultSubmission.metadata?.tryOnRawResultUrl === 'string' &&
    resultSubmission.metadata.tryOnRawResultUrl.trim()
      ? resultSubmission.metadata.tryOnRawResultUrl.trim()
      : resultSubmission.imageUrl;

  const uploadName = `tryon-reframe-${resultSubmission._id.toString()}`;
  const framed = options.dryRun
    ? {
        publicResultUrl: resultSubmission.imageUrl,
        deleteUrl: resultSubmission.deleteUrl ?? null,
        fileSize: resultSubmission.fileSize ?? null,
        mimeType: resultSubmission.mimeType ?? null,
        width: resultSubmission.metadata?.finalWidth ?? null,
        height: resultSubmission.metadata?.finalHeight ?? null,
      }
    : await applyFrameToTryOnResult(baseRawUrl, frameAssetUrl, uploadName);

  const finalUpdates: Document = {
    'metadata.compositionEngine': 'motogp_leather_magic_framed',
    'metadata.tryOnRawResultUrl': baseRawUrl,
    updatedAt: now,
  };

  if (!options.dryRun) {
    finalUpdates.imageUrl = framed.publicResultUrl;
    finalUpdates.finalImageUrl = framed.publicResultUrl;
    finalUpdates.deleteUrl = framed.deleteUrl ?? null;
    finalUpdates.fileSize = framed.fileSize ?? null;
    finalUpdates.mimeType = framed.mimeType ?? null;

    if (framed.width) {
      finalUpdates['metadata.finalWidth'] = framed.width;
    }
    if (framed.height) {
      finalUpdates['metadata.finalHeight'] = framed.height;
    }

    await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: resultSubmission._id },
      { $set: finalUpdates }
    );
  }

  if (!options.dryRun && resultSubmission.sourceJobId) {
    await db.collection<TryOnJob>(COLLECTIONS.TRYON_JOBS).updateOne(
      { jobId: resultSubmission.sourceJobId },
      {
        $set: {
          status: 'done',
          stage: 'done',
          updatedAt: now,
          'processing.finishedAt': now,
          'result.publicResultUrl': framed.publicResultUrl,
          'result.imgbbDeleteUrl': framed.deleteUrl ?? null,
          'result.provider': 'imgbb',
        },
      }
    );
  }

  const sourceSet: Document = {
    'tryOnRequest.resultUrl': framed.publicResultUrl,
    updatedAt: now,
  };

  if (!options.dryRun) {
    sourceSet['tryOnRequest.resultDeleteUrl'] = framed.deleteUrl ?? null;
    sourceSet['tryOnRequest.resultProvider'] = 'imgbb';
  }

  if (!options.dryRun) {
    await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: sourceSubmissionObjectId },
      { $set: sourceSet }
    );
  }

  if (!options.dryRun && resultSubmission.sourceJobId) {
    const jobFilter = { _id: sourceSubmissionObjectId };
    const jobUpdate: Document = {
      $set: {
        'tryOnJobs.$[job].resultUrl': framed.publicResultUrl,
        'tryOnJobs.$[job].updatedAt': now,
        'tryOnJobs.$[job].status': 'done',
      },
    };

    await db
      .collection<Submission>(COLLECTIONS.SUBMISSIONS)
      .updateOne(jobFilter, jobUpdate, {
        arrayFilters: [{ 'job.jobId': resultSubmission.sourceJobId }] as Document[],
      });
  }

  if (options.dryRun) {
    return {
      status: 'updated',
      reason: 'dry_run',
      submissionId: resultSubmissionId,
      message: framed.publicResultUrl,
    };
  }

  return {
    status: 'updated',
    reason: 'framed_success',
    submissionId: resultSubmissionId,
    message: framed.publicResultUrl,
  };
}

async function main() {
  loadEnvFromFiles();
  const options = parseArgs();

  const summary: ScriptCounters = {
    total: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  const db = await connectToDatabase();

  try {
    const candidates = await buildCandidates(db, options);
    if (!candidates.length) {
      console.log('No try-on results eligible for reframing.');
      return;
    }

    console.log(`Found ${candidates.length} candidate try-on results to process`);

    for (const result of candidates) {
      const submissionId = result._id.toString();
      summary.total += 1;

      try {
        const resultRecord = await reframeExistingTryOnResult(db, result, options);

        if (resultRecord.status === 'updated') {
          summary.updated += 1;
          const updatedType = resultRecord.reason === 'dry_run' ? 'DRY' : 'UPDATED';
          console.log(`✅ [${resultRecord.submissionId}] ${updatedType} -> ${resultRecord.message ?? ''}`.trim());
        } else {
          summary.skipped += 1;
          console.log(`⏭️  [${resultRecord.submissionId}] skipped (${resultRecord.reason})`);
        }
      } catch (error: unknown) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [${submissionId}] failed:`, message);
      }
    }

    console.log('\nSummary:');
    console.log(`  Total:   ${summary.total}`);
    console.log(`  Updated: ${summary.updated}`);
    console.log(`  Skipped: ${summary.skipped}`);
    console.log(`  Failed:  ${summary.failed}`);
    console.log(`  Dry-run: ${options.dryRun ? 'yes' : 'no'}`);

    if (options.dryRun) {
      console.log('Dry-run mode completed. No writes were persisted.');
    }
  } finally {
    await closeConnection();
  }
}

main().catch(async (error: unknown) => {
  console.error('Failed to reframe try-on results:', error);
  await closeConnection().catch(() => {});
  process.exitCode = 1;
});
