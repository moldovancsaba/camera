/**
 * Approve or reject a pending photo (camera#267, docs/PHOTO_VETTING_PLAN.md).
 *
 * Approval is where the picture is made: the plain photo and the frame image the photo recorded (the generated frame variant, or the
 * event's own frame) are composed on the server, stored, and only then does the photo become visible. A photo whose frame cannot be
 * fetched or composed stays pending: the brand's frame is never skipped silently. The user gets the share link by email. The private plain
 * photo (the unframed crop) is KEPT (issue 509, "never lose an image": it used to be deleted here, which left the framed picture as the only copy); after the
 * answer is sent a second copy of it goes to ImgBB (owner decision 295) and every copy that exists is recorded and read back (`Submission.imageCopies`,
 * lib/storage/image-copies.ts). How long it is kept is a later decision (owner answer 226: 90 days after the event, then deleted on request); nothing deletes it automatically.
 * (A try-on request held with the photo was queued here until the try-on integration was removed, issue 557.) Rejection keeps the photo private and makes no picture.
 *
 * Every state change is one conditional update on the review status, so two moderators acting at once cannot both win.
 */

import type { Db, Document, ObjectId, WithId } from 'mongodb';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';
import { uploadImageTracked, type MirrorResult } from '@/lib/imgbb/upload';
import { recordApprovalCopies, type ApprovalCopiesInput } from '@/lib/storage/image-copies';
import { logWarn } from '@/lib/observability/logger';
import { buildEmailMetadataPatch, legalOf, resolveEventForSubmission, textsOf, themeOf } from '@/lib/email/submission-result-email';
import { fetchImageBuffer } from '@/lib/media/image-buffer';
import { runAfterResponse } from '@/lib/api/run-after-response';
import { ensureScreenPicture } from '@/lib/submissions/screen-picture';
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
  /** The ImgBB mirror attempt that started with the upload (it may still be running); absent in tests that do not care. Resolves with the copy, or null; never rejects. */
  mirror?: Promise<MirrorResult | null>;
  /** The address of the ImgBB mirror when it answered in time (`deleteUrl` and `imageId` above are its delete link and id), else null. Used when `mirror` is absent. */
  mirrorImageUrl?: string | null;
}

export interface ReviewDeps {
  fetchImage: (url: string) => Promise<Buffer>;
  upload: (base64: string, name: string) => Promise<UploadedPicture>;
  sendApproved: typeof sendPhotoApprovedEmail;
  sendNotApproved: typeof sendPhotoNotApprovedEmail;
  /** Makes the screen-sized picture of the approved photo (camera#476, S7), after the answer is sent; never throws. Absent in tests that do not care. */
  screenPicture?: (db: Db, submission: { _id: ObjectId; imageUrl: string; finalImageUrl: string }) => void;
  /** Records and makes the copies of the approved photo's pictures (issue 509), after the answer is sent; never throws. Absent in tests that do not care. */
  imageCopies?: (db: Db, input: ApprovalCopiesInput) => void;
  now: () => string;
}

export const defaultReviewDeps: ReviewDeps = {
  fetchImage: fetchImageBuffer,
  upload: async (base64, name) => {
    const result = await uploadImageTracked(base64, { name });
    return { imageUrl: result.imageUrl, deleteUrl: result.deleteUrl, imageId: result.imageId, fileSize: result.fileSize, mimeType: result.mimeType, mirror: result.mirrorSettled, mirrorImageUrl: result.mirrorImageUrl };
  },
  sendApproved: sendPhotoApprovedEmail,
  sendNotApproved: sendPhotoNotApprovedEmail,
  screenPicture: (db, submission) => runAfterResponse(() => ensureScreenPicture(db, submission).then(() => undefined)),
  imageCopies: (db, input) => runAfterResponse(() => recordApprovalCopies(db, input).then(() => undefined)),
  now: () => new Date().toISOString(),
};

export type ReviewFailure = 'not_reviewable' | 'no_photo' | 'compose_failed';

export type ApproveResult =
  | { ok: true; email: 'sent' | 'skipped' | 'failed' }
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

  // The picture for the giant screen is made after the answer; a failure there never touches the approval.
  try {
    deps.screenPicture?.(db, { _id: submission._id, imageUrl: picture.imageUrl, finalImageUrl: picture.imageUrl });
  } catch (error) {
    logWarn('screen_picture.not_scheduled', 'The screen picture could not be scheduled', { submissionId: String(submission._id), error: errorMessage(error) });
  }

  const event = await resolveEventForSubmission(db, submission).catch(() => null);

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  if (submission.shareToken && submission.metadata?.emailSentAfterSave !== true) {
    const shareUrl = approvedShareUrl(submission.shareToken);
    try {
      const result = await deps.sendApproved(submission, event, shareUrl, undefined, await themeOf(db, event), await textsOf(db, event), await legalOf(db, event));
      const patch = buildEmailMetadataPatch(result, shareUrl);
      email = patch.sent ? 'sent' : patch.shouldRetry ? 'failed' : 'skipped';
      await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: patch.metadataPatch });
    } catch (error) {
      email = 'failed';
      logWarn('photo_vetting.approval_email_failed', 'The approval email could not be sent', { submissionId: String(submission._id), error: errorMessage(error) });
    }
  }

  // The plain photo stays (issue 509): it is the only unframed copy of the user's picture, and `photoReview.photoUrl` keeps pointing at it so deleting the submission deletes it.
  // The copies are made and recorded after the answer; a failure there never touches the approval.
  try {
    deps.imageCopies?.(db, {
      submissionId: submission._id,
      composed: {
        url: picture.imageUrl,
        bytes: picture.fileSize,
        mirror: picture.mirror ?? (picture.mirrorImageUrl ? { imageUrl: picture.mirrorImageUrl, deleteUrl: picture.deleteUrl, imageId: picture.imageId } : null),
      },
      unframed: { url: review.photoUrl, buffer: photo },
    });
  } catch (error) {
    logWarn('image_copy.not_scheduled', 'The copies of the approved photo could not be scheduled', { submissionId: String(submission._id), error: errorMessage(error) });
  }

  return { ok: true, email };
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
      },
      $push: { reviewHistory: { action: 'reject', by: actorName(actor), at, reason } } as Document,
    }
  );
  if (won.matchedCount === 0) return { ok: false, reason: 'not_reviewable', message: 'Someone else already decided on this photo' };

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  try {
    const event = await resolveEventForSubmission(db, submission).catch(() => null);
    const result = await deps.sendNotApproved(submission, event, takeAnotherPhotoUrl(String(submission.eventId ?? event?._id ?? ''), undefined, event), undefined, await themeOf(db, event), await textsOf(db, event), await legalOf(db, event));
    email = result.sent ? 'sent' : 'skipped' in result && result.skipped ? 'skipped' : 'failed';
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: { 'metadata.rejectionEmailSent': result.sent, 'metadata.rejectionEmailAt': at } });
  } catch (error) {
    email = 'failed';
    logWarn('photo_vetting.rejection_email_failed', 'The not-approved email could not be sent', { submissionId: String(submission._id), error: errorMessage(error) });
  }
  return { ok: true, email };
}
