/**
 * Approve or reject a pending photo (camera#267, docs/PHOTO_VETTING_PLAN.md).
 *
 * Approval is where the picture is made: the plain photo and the frame image the photo recorded (the generated frame variant, or the
 * event's own frame) are composed on the server, stored, and only then does the photo become visible. A photo whose frame cannot be
 * fetched or composed stays pending: the brand's frame is never skipped silently. The held try-on request is queued after approval,
 * the guest gets the share link by email, and the private plain photo is deleted. Rejection keeps the photo private and makes no picture.
 *
 * Every state change is one conditional update on the review status, so two moderators acting at once cannot both win.
 */

import { del } from '@vercel/blob';
import type { Db, Document, WithId } from 'mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { uploadImage } from '@/lib/imgbb/upload';
import { logWarn } from '@/lib/observability/logger';
import { buildEmailMetadataPatch, resolveEventForSubmission, textsOf, themeOf } from '@/lib/email/submission-result-email';
import { enqueueTryOnForSubmission, type TryOnEnqueueOutcome } from '@/lib/tryon/enqueue-for-submission';
import { fetchImageBuffer } from '@/lib/tryon/frame-composition';
import sharp from 'sharp';
import { composePhotoWithFrame } from '@/lib/photo-vetting/compose';
import { approvedShareUrl, sendPhotoApprovedEmail, sendPhotoNotApprovedEmail, takeAnotherPhotoUrl } from '@/lib/photo-vetting/emails';

export interface ReviewActor {
  email: string | null;
  id: string | null;
}

export interface UploadedPicture {
  imageUrl: string;
  deleteUrl: string;
  imageId: string;
  fileSize: number;
  mimeType: string;
}

export interface ReviewDeps {
  fetchImage: (url: string) => Promise<Buffer>;
  upload: (base64: string, name: string) => Promise<UploadedPicture>;
  deleteFile: (url: string) => Promise<void>;
  enqueueTryOn: typeof enqueueTryOnForSubmission;
  sendApproved: typeof sendPhotoApprovedEmail;
  sendNotApproved: typeof sendPhotoNotApprovedEmail;
  now: () => string;
}

export const defaultReviewDeps: ReviewDeps = {
  fetchImage: fetchImageBuffer,
  upload: async (base64, name) => {
    const result = await uploadImage(base64, { name });
    return { imageUrl: result.imageUrl, deleteUrl: result.deleteUrl, imageId: result.imageId, fileSize: result.fileSize, mimeType: result.mimeType };
  },
  deleteFile: (url) => del(url),
  enqueueTryOn: enqueueTryOnForSubmission,
  sendApproved: sendPhotoApprovedEmail,
  sendNotApproved: sendPhotoNotApprovedEmail,
  now: () => new Date().toISOString(),
};

export type ReviewFailure = 'not_reviewable' | 'no_photo' | 'compose_failed';

export type ApproveResult =
  | { ok: true; tryOn: TryOnEnqueueOutcome | null; email: 'sent' | 'skipped' | 'failed' }
  | { ok: false; reason: ReviewFailure; message: string };

export type RejectResult =
  | { ok: true; email: 'sent' | 'skipped' | 'failed' }
  | { ok: false; reason: ReviewFailure; message: string };

const actorName = (actor: ReviewActor) => actor.email ?? actor.id ?? 'unknown';
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The frame image the photo recorded: its generated variant, else the event's own frame; null when it had none. */
export async function resolveFrameImageUrl(db: Db, submission: Pick<Submission, 'frameVariant' | 'frameId'>): Promise<string | null> {
  const variantUrl = submission.frameVariant?.imageUrl;
  if (typeof variantUrl === 'string' && variantUrl) return variantUrl;
  if (!submission.frameId) return null;
  const frame = await db.collection(COLLECTIONS.FRAMES).findOne({ frameId: submission.frameId }, { projection: { imageUrl: 1 } });
  return typeof frame?.imageUrl === 'string' && frame.imageUrl ? frame.imageUrl : null;
}

export async function approvePhoto(db: Db, submission: WithId<Submission>, actor: ReviewActor, deps: ReviewDeps = defaultReviewDeps): Promise<ApproveResult> {
  if (submission.reviewStatus !== 'pending_review' && submission.reviewStatus !== 'rejected') {
    return { ok: false, reason: 'not_reviewable', message: 'This photo is not waiting for a decision' };
  }
  const review = submission.photoReview;
  if (!review?.photoUrl) return { ok: false, reason: 'no_photo', message: 'The photo file is not available' };

  let photo: Buffer;
  let picture: UploadedPicture;
  let size: { width: number; height: number };
  try {
    photo = await deps.fetchImage(review.photoUrl);
    const frameUrl = await resolveFrameImageUrl(db, submission);
    if (frameUrl) {
      const composed = await composePhotoWithFrame(photo, await deps.fetchImage(frameUrl));
      size = { width: composed.width, height: composed.height };
      picture = await deps.upload(composed.buffer.toString('base64'), `submission-${Date.now()}`);
    } else {
      const { width, height } = await sharp(photo, { failOn: 'none' }).metadata();
      size = { width: width ?? 0, height: height ?? 0 };
      picture = await deps.upload(photo.toString('base64'), `submission-${Date.now()}`);
    }
  } catch (error) {
    logWarn('photo_vetting.compose_failed', 'The approved photo could not be composed; it stays pending', { submissionId: String(submission._id), error: errorMessage(error) });
    return { ok: false, reason: 'compose_failed', message: 'The picture could not be made; the photo stays pending. Try again in a moment.' };
  }

  const at = deps.now();
  const won = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submission._id, reviewStatus: { $in: ['pending_review', 'rejected'] } },
    {
      $set: {
        imageUrl: picture.imageUrl,
        finalImageUrl: picture.imageUrl,
        originalImageUrl: picture.imageUrl,
        deleteUrl: picture.deleteUrl,
        imageId: picture.imageId,
        fileSize: picture.fileSize,
        mimeType: picture.mimeType,
        'metadata.finalWidth': size.width,
        'metadata.finalHeight': size.height,
        'metadata.finalFileSize': picture.fileSize,
        'metadata.compositionEngine': 'camera_capture_server',
        reviewStatus: 'approved',
        reviewNotes: null,
        approvedAt: at,
        approvedBy: actorName(actor),
        isShareVisible: review.shareOptIn === true,
        updatedAt: at,
      },
      $push: { reviewHistory: { action: 'approve', by: actorName(actor), at, reason: null } } as Document,
    }
  );
  if (won.matchedCount === 0) return { ok: false, reason: 'not_reviewable', message: 'Someone else already decided on this photo' };

  const event = await resolveEventForSubmission(db, submission).catch(() => null);

  let tryOn: TryOnEnqueueOutcome | null = null;
  if (review.tryOn?.leatherSuitId) {
    try {
      tryOn = await deps.enqueueTryOn(db, {
        submissionId: String(submission._id),
        createdAt: at,
        eventId: typeof submission.eventId === 'string' && submission.eventId ? submission.eventId : null,
        partnerId: submission.partnerId ?? null,
        userId: submission.userId || 'anonymous',
        eventPolicy: event ? { _id: String(event._id), name: event.name, tryOn: event.tryOn } : null,
        request: {
          requested: true,
          leatherSuitId: review.tryOn.leatherSuitId,
          sourceImageData: `data:${review.photoMime};base64,${photo.toString('base64')}`,
          setupId: review.tryOn.setupId,
          cameraId: review.tryOn.cameraId,
          outfitBottomLeatherSuitId: review.tryOn.outfitBottomLeatherSuitId,
        },
      });
    } catch (error) {
      logWarn('photo_vetting.tryon_enqueue_failed', 'The held try-on request could not be queued', { submissionId: String(submission._id), error: errorMessage(error) });
    }
  }

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  if (submission.shareToken && submission.metadata?.emailSentAfterSave !== true) {
    const shareUrl = approvedShareUrl(submission.shareToken);
    try {
      const result = await deps.sendApproved(submission, event, shareUrl, undefined, await themeOf(db, event), await textsOf(db, event));
      const patch = buildEmailMetadataPatch('after_save', result, shareUrl);
      email = patch.sent ? 'sent' : patch.shouldRetry ? 'failed' : 'skipped';
      await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: patch.metadataPatch });
    } catch (error) {
      email = 'failed';
      logWarn('photo_vetting.approval_email_failed', 'The approval email could not be sent', { submissionId: String(submission._id), error: errorMessage(error) });
    }
  }

  // The plain photo is private and no longer needed: the picture exists and the try-on source is stored on its own.
  try {
    await deps.deleteFile(review.photoUrl);
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: { 'photoReview.photoUrl': null } });
  } catch (error) {
    logWarn('photo_vetting.pending_photo_not_deleted', 'The private photo of an approved submission was not deleted', { submissionId: String(submission._id), error: errorMessage(error) });
  }

  return { ok: true, tryOn, email };
}

export async function rejectPhoto(db: Db, submission: WithId<Submission>, actor: ReviewActor, reason: string | null, deps: ReviewDeps = defaultReviewDeps): Promise<RejectResult> {
  if (submission.reviewStatus !== 'pending_review') {
    return { ok: false, reason: 'not_reviewable', message: 'This photo is not waiting for a decision' };
  }
  const at = deps.now();
  const won = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submission._id, reviewStatus: 'pending_review' },
    {
      $set: {
        reviewStatus: 'rejected',
        reviewNotes: reason,
        isShareVisible: false,
        updatedAt: at,
        ...(submission.tryOnRequest?.requested ? { 'tryOnRequest.status': 'cancelled', 'tryOnRequest.lastUpdatedAt': at } : {}),
      },
      $push: { reviewHistory: { action: 'reject', by: actorName(actor), at, reason } } as Document,
    }
  );
  if (won.matchedCount === 0) return { ok: false, reason: 'not_reviewable', message: 'Someone else already decided on this photo' };

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  try {
    const event = await resolveEventForSubmission(db, submission).catch(() => null);
    const result = await deps.sendNotApproved(submission, event, takeAnotherPhotoUrl(String(submission.eventId ?? event?._id ?? '')), undefined, await themeOf(db, event), await textsOf(db, event));
    email = result.sent ? 'sent' : 'skipped' in result && result.skipped ? 'skipped' : 'failed';
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: { 'metadata.rejectionEmailSent': result.sent, 'metadata.rejectionEmailAt': at } });
  } catch (error) {
    email = 'failed';
    logWarn('photo_vetting.rejection_email_failed', 'The not-approved email could not be sent', { submissionId: String(submission._id), error: errorMessage(error) });
  }
  return { ok: true, email };
}
