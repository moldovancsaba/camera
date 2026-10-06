/**
 * Puts a try-on request of a saved photo on the queue (camera#116, camera#266): checks the event's try-on policy and the garment,
 * stores the source photo, inserts or finds the job and links it to the submission. Never throws: a failure is recorded on the
 * submission as `enqueue_failed` and returned. A vetted photo calls this when it is approved, a plain photo when it is saved.
 */

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { uploadImage } from '@/lib/imgbb/upload';
import { COLLECTIONS, type TryOnSetup } from '@/lib/db/schemas';
import {
  buildSubmissionTryOnLink,
  insertOrGetTryOnJob,
  patchSubmissionTryOnState,
  upsertSubmissionTryOnLink,
} from '@/lib/tryon/jobs';
import { assertValidLeatherSuitId } from '@/lib/tryon/suits';
import { findDefaultSetupForGarmentType } from '@/lib/tryon/setup-resolution';
import { buildTryOnPromptSnapshot } from '@/lib/tryon/prompts';

export interface TryOnRequestDetails {
  requested: boolean;
  leatherSuitId: string | null;
  sourceImageData: string | null;
  setupId?: string | null;
  cameraId?: string | null;
  outfitBottomLeatherSuitId?: string | null;
}

export interface TryOnPolicyEvent {
  _id: string;
  name?: string;
  tryOn?: {
    enabled?: boolean;
    allowedLeatherSuitIds?: string[];
    setupId?: string | null;
  };
}

export interface TryOnEnqueueInput {
  submissionId: string;
  createdAt: string;
  eventId: string | null;
  partnerId: unknown;
  userId: string;
  eventPolicy: TryOnPolicyEvent | null;
  request: TryOnRequestDetails;
}

export interface TryOnEnqueueOutcome {
  status: 'queued' | 'deduplicated' | 'enqueue_failed';
  jobId: string | null;
  error: string | null;
}

function mongoIdString(id: unknown): string {
  if (typeof id === 'string' && id.trim()) return id.trim();
  if (id && typeof id === 'object' && 'toString' in id && typeof id.toString === 'function') return id.toString();
  return '';
}

function eventLookupFilter(eventId: string): { $or: Array<Record<string, unknown>> } {
  const normalized = eventId.trim();
  const query: { $or: Array<Record<string, unknown>> } = { $or: [{ eventId: normalized }, { shortUrlSlug: normalized }] };
  if (ObjectId.isValid(normalized)) query.$or.push({ _id: new ObjectId(normalized) });
  return query;
}

export async function enqueueTryOnForSubmission(db: Db, input: TryOnEnqueueInput): Promise<TryOnEnqueueOutcome> {
  const { submissionId, createdAt, eventId, partnerId, userId, eventPolicy, request } = input;
  const outcome: TryOnEnqueueOutcome = { status: 'enqueue_failed', jobId: null, error: null };

  const resolvedSetupId =
    request.setupId ??
    (!request.cameraId
      ? eventPolicy?.tryOn?.setupId && eventPolicy.tryOn.setupId.trim()
        ? eventPolicy.tryOn.setupId.trim()
        : null
      : null);

  try {
    if (!request.leatherSuitId) {
      throw new Error('leather_suit_id is required when try-on is requested');
    }
    if (!request.sourceImageData) {
      throw new Error('try_on_source_image_data is required when try-on is requested');
    }

    if (eventId) {
      const eventPolicyForTryOn = eventPolicy
        ? ({ _id: null, tryOn: eventPolicy.tryOn })
        : await db.collection(COLLECTIONS.EVENTS).findOne(
            eventLookupFilter(eventId),
            { projection: { _id: 1, tryOn: 1 } }
          );
      if (!eventPolicyForTryOn?.tryOn?.enabled) {
        throw new Error('try_on_not_enabled_for_event');
      }
      const allowedSuitIds = Array.isArray(eventPolicyForTryOn?.tryOn?.allowedLeatherSuitIds)
        ? eventPolicyForTryOn.tryOn.allowedLeatherSuitIds
        : [];
      if (
        allowedSuitIds.length > 0 &&
        !allowedSuitIds.includes(request.leatherSuitId)
      ) {
        throw new Error('leather_suit_not_allowed_for_event');
      }
      if (request.outfitBottomLeatherSuitId) {
        // Outfit pairing (try-on#39 contract, implemented here per
        // camera#116). The flag is read from the event document at
        // submit time, never trusted from the client; the allowlist
        // rule applies to BOTH pieces.
        if (eventPolicyForTryOn?.tryOn?.outfitEnabled !== true) {
          throw new Error('outfit_not_enabled_for_event');
        }
        if (
          allowedSuitIds.length > 0 &&
          !allowedSuitIds.includes(request.outfitBottomLeatherSuitId)
        ) {
          throw new Error('leather_suit_not_allowed_for_event');
        }
      }
    } else if (request.outfitBottomLeatherSuitId) {
      // Outfit selection is an event-scoped feature; the eventless
      // capture flow has no outfitEnabled policy to validate against.
      throw new Error('outfit_not_enabled_for_event');
    }

    const selectedGarment = await assertValidLeatherSuitId(db, request.leatherSuitId);

    // Garment-type default (defaultForGarmentTypes on a setup): more
    // specific than the event's generic tryOn.setupId, so it wins over it
    // when the request itself named no setup. A full-body leather-suit
    // setup on the event must not drive a short-sleeve jersey render.
    const garmentDefaultSetup = !request.setupId
      ? await findDefaultSetupForGarmentType(db, selectedGarment.garmentType || 'motorsport_suit')
      : null;
    const finalSetupId = request.setupId ?? garmentDefaultSetup?.setupId ?? resolvedSetupId;
    if (request.outfitBottomLeatherSuitId) {
      // Server-side type pairing, mirroring the worker's own claim-time
      // validation (defense in depth): the primary garment must be a
      // 'top' and the paired piece a 'bottom'.
      if ((selectedGarment.garmentType || 'motorsport_suit') !== 'top') {
        throw new Error('outfit_top_type_required');
      }
      const bottomGarment = await assertValidLeatherSuitId(db, request.outfitBottomLeatherSuitId);
      if (bottomGarment.garmentType !== 'bottom') {
        throw new Error('outfit_bottom_type_mismatch');
      }
    }

    const sourceBase64 = request.sourceImageData.split(',')[1];
    if (!sourceBase64) {
      throw new Error('try_on_source_image_data must be a valid base64 data URL');
    }

    const sourceUpload = await uploadImage(sourceBase64, {
      name: `tryon-source-${Date.now()}`,
    });

    const eventDocument = eventId
      ? await db.collection(COLLECTIONS.EVENTS).findOne(
          eventLookupFilter(eventId),
          { projection: { _id: 1 } }
        )
      : null;

    const promptSetup = finalSetupId
      ? await db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).findOne({ setupId: finalSetupId, active: true })
      : null;
    const promptConfig = promptSetup?.promptConfig;
    const promptSnapshotResult = promptConfig
      ? buildTryOnPromptSnapshot({
          setupId: promptSetup.setupId,
          version: promptConfig.version,
          positive: promptConfig.positive,
          negative: promptConfig.negative,
          source: 'setup',
          createdAt,
        })
      : null;
    if (promptSnapshotResult && !promptSnapshotResult.ok) {
      throw new Error('try_on_prompt_configuration_invalid');
    }

    const linkedJob = await insertOrGetTryOnJob(db, {
      submissionId,
      imageUrl: sourceUpload.imageUrl,
      leatherSuitId: request.leatherSuitId,
      garmentType: selectedGarment.garmentType || 'motorsport_suit',
      sleeveStyle: selectedGarment.sleeveStyle ?? null,
      outfitBottomLeatherSuitId: request.outfitBottomLeatherSuitId ?? null,
      setupId: finalSetupId,
      cameraId: request.cameraId,
      eventId: typeof eventId === 'string' ? eventId : null,
      eventMongoId: eventDocument?._id ? mongoIdString(eventDocument._id) : null,
      partnerId: typeof partnerId === 'string' ? partnerId : null,
      userId: userId,
      promptSnapshot: promptSnapshotResult?.ok ? promptSnapshotResult.snapshot : null,
    });

    if (ObjectId.isValid(submissionId)) {
      const submissionObjectId = new ObjectId(submissionId);
      await patchSubmissionTryOnState(db, submissionObjectId, {
        status: 'source_uploaded',
        requested: true,
        requestedAt: createdAt,
        leatherSuitId: request.leatherSuitId,
        sourceImageUrl: sourceUpload.imageUrl,
        sourceDeleteUrl: sourceUpload.deleteUrl ?? null,
        sourceImageId: sourceUpload.imageId ?? null,
        reviewStatus: null,
        shareVisible: false,
        slideshowEligible: false,
        lastError: null,
      });

      await upsertSubmissionTryOnLink(
        db,
        submissionObjectId,
        buildSubmissionTryOnLink(
          linkedJob.job,
          linkedJob.deduplicated ? linkedJob.job.status : 'queued',
          linkedJob.job.result.publicResultUrl ?? null
        )
      );

      await patchSubmissionTryOnState(db, submissionObjectId, {
        status: linkedJob.deduplicated ? linkedJob.job.status : 'queued',
        requested: true,
        requestedAt: createdAt,
        leatherSuitId: request.leatherSuitId,
        jobId: linkedJob.job.jobId,
        sourceImageUrl: sourceUpload.imageUrl,
        sourceDeleteUrl: sourceUpload.deleteUrl ?? null,
        sourceImageId: sourceUpload.imageId ?? null,
        resultUrl: linkedJob.job.result.publicResultUrl ?? null,
        resultDeleteUrl: linkedJob.job.result.imgbbDeleteUrl ?? null,
        resultProvider: linkedJob.job.result.provider ?? null,
        reviewStatus: null,
        shareVisible: false,
        slideshowEligible: false,
        lastError: null,
      });
    }

    outcome.status = linkedJob.deduplicated ? 'deduplicated' : 'queued';
    outcome.jobId = linkedJob.job.jobId;
  } catch (tryOnError: unknown) {
    outcome.status = 'enqueue_failed';
    outcome.error =
      tryOnError instanceof Error ? tryOnError.message : 'Unable to enqueue try-on job';

    if (ObjectId.isValid(submissionId)) {
      await patchSubmissionTryOnState(db, new ObjectId(submissionId), {
        status: 'enqueue_failed',
        requested: true,
        requestedAt: createdAt,
        leatherSuitId: request.leatherSuitId,
        reviewStatus: null,
        shareVisible: false,
        slideshowEligible: false,
        lastError: outcome.error,
      });
    }
  }
  return outcome;
}
