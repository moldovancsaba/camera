import type { Db, ObjectId, WithId } from 'mongodb';
import {
  COLLECTIONS,
  DeviceType,
  SubmissionMethod,
  SubmissionStatus,
  type Submission,
  type SubmissionTryOnLink,
  type TryOnJob,
} from '@/lib/db/schemas';
import { nowIso } from '@/lib/tryon/time';

export type TryOnReviewStatus = 'pending_review' | 'approved' | 'rejected';
export type SlideshowSourceMode =
  | 'originals_only'
  | 'approved_tryon_only'
  | 'originals_and_approved_tryon';

export interface CreateDerivedTryOnSubmissionInput {
  sourceSubmission: WithId<Submission>;
  job: WithId<TryOnJob>;
  publicResultUrl: string;
  deleteUrl?: string | null;
  pipelineVersion?: string | null;
}

export interface TryOnPublicationSummary {
  resultSubmissionId: string;
  jobId: string;
  leatherSuitId: string;
  resultUrl: string | null;
  reviewStatus: TryOnReviewStatus;
  shareVisible: boolean;
  slideshowEligible: boolean;
  updatedAt: string;
}

export function buildDerivedTryOnSubmission({
  sourceSubmission,
  job,
  publicResultUrl,
  deleteUrl,
  pipelineVersion,
}: CreateDerivedTryOnSubmissionInput): Submission {
  const timestamp = nowIso();
  const eventIds = Array.isArray(sourceSubmission.eventIds) ? sourceSubmission.eventIds : [];

  return {
    submissionId:
      typeof sourceSubmission.submissionId === 'string' && sourceSubmission.submissionId.trim()
        ? `${sourceSubmission.submissionId}__${job.jobId}`
        : job.jobId,
    userId: sourceSubmission.userId,
    userEmail: sourceSubmission.userEmail,
    userName: sourceSubmission.userName,
    frameId: sourceSubmission.frameId,
    frameName: sourceSubmission.frameName ?? null,
    frameCategory: sourceSubmission.frameCategory ?? null,
    partnerId: sourceSubmission.partnerId ?? null,
    partnerName: sourceSubmission.partnerName ?? null,
    eventId: sourceSubmission.eventId ?? eventIds[0] ?? null,
    eventIds,
    eventName: sourceSubmission.eventName ?? null,
    imageUrl: publicResultUrl,
    deleteUrl: deleteUrl ?? undefined,
    originalImageUrl:
      typeof sourceSubmission.originalImageUrl === 'string' && sourceSubmission.originalImageUrl.trim()
        ? sourceSubmission.originalImageUrl
        : job.source.imageUrl,
    finalImageUrl: publicResultUrl,
    method: sourceSubmission.method ?? SubmissionMethod.FILE_UPLOAD,
    status: SubmissionStatus.COMPLETED,
    consents: Array.isArray(sourceSubmission.consents) ? sourceSubmission.consents : [],
    metadata:
      sourceSubmission.metadata && typeof sourceSubmission.metadata === 'object'
        ? {
            ...sourceSubmission.metadata,
            originalWidth: sourceSubmission.metadata.originalWidth ?? sourceSubmission.metadata.finalWidth ?? 0,
            originalHeight: sourceSubmission.metadata.originalHeight ?? sourceSubmission.metadata.finalHeight ?? 0,
            originalFileSize: sourceSubmission.metadata.originalFileSize ?? sourceSubmission.metadata.finalFileSize ?? sourceSubmission.fileSize ?? 0,
            originalMimeType: sourceSubmission.metadata.originalMimeType ?? sourceSubmission.mimeType ?? 'image/png',
            finalFileSize: sourceSubmission.metadata.finalFileSize ?? sourceSubmission.fileSize ?? 0,
            finalWidth: sourceSubmission.metadata.finalWidth ?? sourceSubmission.metadata.originalWidth ?? 0,
            finalHeight: sourceSubmission.metadata.finalHeight ?? sourceSubmission.metadata.originalHeight ?? 0,
            emailSent: sourceSubmission.metadata.emailSent ?? false,
            compositionEngine: 'motogp_leather_magic',
          }
        : {
            deviceType: DeviceType.UNKNOWN,
            originalWidth: 0,
            originalHeight: 0,
            originalFileSize: sourceSubmission.fileSize ?? 0,
            originalMimeType: sourceSubmission.mimeType ?? 'image/png',
            finalFileSize: sourceSubmission.fileSize ?? 0,
            finalWidth: 0,
            finalHeight: 0,
            compositionEngine: 'motogp_leather_magic',
            emailSent: false,
          },
    shareCount: 0,
    downloadCount: 0,
    isArchived: false,
    hiddenFromPartner: false,
    hiddenFromEvents: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    submissionKind: 'tryon_result',
    sourceSubmissionId: sourceSubmission._id?.toString() ?? null,
    sourceJobId: job.jobId,
    tryOnLeatherSuitId: job.request.leatherSuitId,
    tryOnPipeline: job.pipeline,
    tryOnPipelineVersion: pipelineVersion?.trim() || job.pipelineVersion,
    reviewStatus: 'pending_review',
    reviewedAt: null,
    reviewedBy: null,
    reviewNotes: null,
    approvedAt: null,
    approvedBy: null,
    isShareVisible: false,
    isSlideshowEligible: false,
    tryOnJobs: [],
  };
}

export function buildTryOnPublicationSummary(
  resultSubmissionId: string,
  jobId: string,
  leatherSuitId: string,
  resultUrl: string | null,
  reviewStatus: TryOnReviewStatus,
  shareVisible: boolean,
  slideshowEligible: boolean
): TryOnPublicationSummary {
  return {
    resultSubmissionId,
    jobId,
    leatherSuitId,
    resultUrl,
    reviewStatus,
    shareVisible,
    slideshowEligible,
    updatedAt: nowIso(),
  };
}

export async function upsertSubmissionTryOnPublicationLink(
  db: Db,
  sourceSubmissionObjectId: ObjectId,
  summary: TryOnPublicationSummary
): Promise<void> {
  const submissions = db.collection<Submission>(COLLECTIONS.SUBMISSIONS);
  const nextLink: SubmissionTryOnLink = {
    jobId: summary.jobId,
    leatherSuitId: summary.leatherSuitId,
    status: 'done',
    resultUrl: summary.resultUrl,
    resultSubmissionId: summary.resultSubmissionId,
    reviewStatus: summary.reviewStatus,
    shareVisible: summary.shareVisible,
    slideshowEligible: summary.slideshowEligible,
    createdAt: summary.updatedAt,
    updatedAt: summary.updatedAt,
  };

  const existing = await submissions.updateOne(
    { _id: sourceSubmissionObjectId, 'tryOnJobs.jobId': summary.jobId },
    {
      $set: {
        'tryOnJobs.$.status': 'done',
        'tryOnJobs.$.resultUrl': summary.resultUrl,
        'tryOnJobs.$.resultSubmissionId': summary.resultSubmissionId,
        'tryOnJobs.$.reviewStatus': summary.reviewStatus,
        'tryOnJobs.$.shareVisible': summary.shareVisible,
        'tryOnJobs.$.slideshowEligible': summary.slideshowEligible,
        'tryOnJobs.$.updatedAt': summary.updatedAt,
      },
    }
  );

  if (existing.matchedCount > 0) return;

  await submissions.updateOne(
    { _id: sourceSubmissionObjectId },
    {
      $push: {
        tryOnJobs: nextLink,
      },
    }
  );
}

export async function listApprovedShareVariants(
  db: Db,
  sourceSubmissionObjectId: string
): Promise<Array<WithId<Submission>>> {
  return db
    .collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find({
      submissionKind: 'tryon_result',
      sourceSubmissionId: sourceSubmissionObjectId,
      reviewStatus: 'approved',
      isShareVisible: true,
      isArchived: { $ne: true },
    })
    .sort({ approvedAt: -1, createdAt: -1 })
    .toArray();
}
