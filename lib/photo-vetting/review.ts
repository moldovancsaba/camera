/**
 * Approve, reject or reopen a decided photo (camera#267, docs/PHOTO_VETTING_PLAN.md).
 *
 * Approval is where the picture is made: the plain photo and the frame image the photo recorded (the generated frame variant, or the
 * event's own frame) are composed on the server, stored, and only then does the photo become visible. A photo whose frame cannot be
 * fetched or composed stays pending: the brand's frame is never skipped silently. A reopened approved photo reuses its composed image if its private source is gone. The user gets the share link by email. The private plain
 * photo (the unframed crop) is NOT deleted here any more (issue 509, "never lose an image": that left the framed picture as the only copy). After the
 * answer is sent a copy of it goes to ImgBB (owner decision 295), every copy that exists is recorded and read back (`Submission.imageCopies`,
 * lib/storage/image-copies.ts), and **only when the ImgBB copy is verified is the private Blob file deleted** (owner decision "variant B"; `photoReview.photoUrl` then becomes null).
 * If the ImgBB copy fails, times out or has another size, the Blob file stays, so there is always at least one copy. The 90 days after the event that ImgBB keeps it (owner answer 226) is a later step.
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
import { approvedShareUrl, sendPhotoApprovedEmail, sendPhotoNotApprovedEmail, sendPhotoUnderReviewEmail, takeAnotherPhotoUrl } from '@/lib/photo-vetting/emails';
import { isPubliclyVisible, visibilityInputOf } from '@/lib/submissions/visibility';

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
  sendUnderReview: typeof sendPhotoUnderReviewEmail;
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
  sendUnderReview: sendPhotoUnderReviewEmail,
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

export type ReturnToVettingResult =
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
  if (submission.retentionStatus === 'pending_erasure' || submission.retentionStatus === 'erasing' || submission.retentionStatus === 'erased') {
    return { ok: false, reason: 'not_reviewable', message: 'This capture is scheduled for erasure and cannot be approved' };
  }
  if (submission.reviewStatus !== 'pending_review' && submission.reviewStatus !== 'rejected') {
    return { ok: false, reason: 'not_reviewable', message: 'This photo is not waiting for a decision' };
  }
  const review = submission.photoReview;
  const reopeningExistingImage = Boolean(review?.returnedAt && submission.imageUrl);
  if (!review || (!review.photoUrl && !reopeningExistingImage)) return { ok: false, reason: 'no_photo', message: 'The photo file is not available' };

  let photo: Buffer | null = null;
  let picture: UploadedPicture;
  let size: { width: number; height: number };
  if (reopeningExistingImage) {
    const { finalWidth, finalHeight } = submission.metadata ?? {};
    size = { width: typeof finalWidth === 'number' ? finalWidth : 0, height: typeof finalHeight === 'number' ? finalHeight : 0 };
    picture = {
      imageUrl: submission.imageUrl!, deleteUrl: submission.deleteUrl ?? '', imageId: submission.imageId ?? '',
      fileSize: submission.fileSize ?? 0, mimeType: submission.mimeType ?? 'image/jpeg',
    };
  } else {
    try {
      photo = await deps.fetchImage(review.photoUrl!);
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
  }

  const at = deps.now();
  const won = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submission._id, reviewStatus: { $in: ['pending_review', 'rejected'] }, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
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
      // A photo that was rejected and is approved again is not a rejected photo any more: its reject reasons go (they stay in the review history).
      $unset: { rejectReasons: '', 'photoReview.returnedAt': '', 'photoReview.returnedFromStatus': '', 'photoReview.returnedWasPubliclyVisible': '' },
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
  const consentStillPending = submission.consentStatus === 'pending' || submission.consentStatus === 'expiring' || submission.consentStatus === 'expired';
  // MongoDB does not mutate the document read above when the approval update succeeds. Check the state that was just saved,
  // rather than the stale pending_review document, or every first-time approval is mistaken for a private photo and skips email.
  const approvedSubmission = { ...submission, reviewStatus: 'approved', isShareVisible: review.shareOptIn === true };
  if (submission.shareToken && !consentStillPending && isPubliclyVisible(visibilityInputOf(approvedSubmission)) && (reopeningExistingImage || submission.metadata?.emailSentAfterSave !== true)) {
    const shareUrl = approvedShareUrl(submission.shareToken);
    try {
      const result = await deps.sendApproved(approvedSubmission, event, shareUrl, undefined, await themeOf(db, event), await textsOf(db, event), await legalOf(db, event));
      const patch = buildEmailMetadataPatch(result, shareUrl);
      email = patch.sent ? 'sent' : patch.shouldRetry ? 'failed' : 'skipped';
      await db.collection(COLLECTIONS.SUBMISSIONS).updateOne({ _id: submission._id }, { $set: patch.metadataPatch });
    } catch (error) {
      email = 'failed';
      logWarn('photo_vetting.approval_email_failed', 'The approval email could not be sent', { submissionId: String(submission._id), error: errorMessage(error) });
    }
  }

  // The plain photo is not deleted here (issue 509): it is the only unframed copy of the user's picture until its ImgBB copy is verified. The follow-up work makes that copy after the answer and
  // deletes the Blob file only then (variant B); a failure there never touches the approval, and until then `photoReview.photoUrl` keeps pointing at the file so deleting the submission deletes it.
  try {
    if (!photo || !review.photoUrl) return { ok: true, email };
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

async function sendApprovedLinkForSubmission(db: Db, submission: Submission | null, deps: ReviewDeps): Promise<'sent' | 'skipped' | 'failed'> {
  if (!submission || submission.reviewStatus !== 'approved' || !isPubliclyVisible(visibilityInputOf({ ...submission })) || !submission.shareToken || !submission.imageUrl || submission.metadata?.emailSentAfterSave === true || submission.metadata?.emailSent === true) {
    return 'skipped';
  }

  const event = await resolveEventForSubmission(db, submission).catch(() => null);
  const shareUrl = approvedShareUrl(submission.shareToken);
  try {
    const result = await deps.sendApproved(submission, event, shareUrl, undefined, await themeOf(db, event), await textsOf(db, event), await legalOf(db, event));
    const patch = buildEmailMetadataPatch(result, shareUrl);
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submission._id, reviewStatus: 'approved', 'metadata.emailSentAfterSave': { $ne: true } },
      { $set: patch.metadataPatch },
    );
    return patch.sent ? 'sent' : patch.shouldRetry ? 'failed' : 'skipped';
  } catch (error) {
    logWarn('photo_vetting.approval_email_failed', 'The approval email could not be sent', { submissionId: String(submission._id), error: errorMessage(error) });
    return 'failed';
  }
}

/** Send the approved share link when a guest records consent after moderation has already approved the photo. */
export async function sendApprovedLinkAfterConsent(db: Db, submissionId: ObjectId, deps: ReviewDeps = defaultReviewDeps): Promise<'sent' | 'skipped' | 'failed'> {
  const submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
  if (!submission || submission.consentStatus !== 'received' || submission.retentionStatus === 'pending_erasure' || submission.retentionStatus === 'erasing' || submission.retentionStatus === 'erased') return 'skipped';
  return sendApprovedLinkForSubmission(db, submission, deps);
}

/** Let an event manager retry a missed approval email for an already-approved, public photo. */
export async function retryApprovedPhotoEmail(db: Db, submissionId: ObjectId, deps: ReviewDeps = defaultReviewDeps): Promise<'sent' | 'skipped' | 'failed'> {
  const submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
  if (submission?.retentionStatus === 'pending_erasure' || submission?.retentionStatus === 'erasing' || submission?.retentionStatus === 'erased') return 'skipped';
  return sendApprovedLinkForSubmission(db, submission, deps);
}

/**
 * `reasons` are the keys of the reject reasons the reviewer chose (lib/photo-vetting/vocabulary.ts, group `reject_reason`; the route has checked them against the event's list), kept on the photo
 * as `rejectReasons` and in the review history entry; `reason` is the free-text note. A photo rejected before reasons existed has neither, and the history entry carries `reasons` only when there are some.
 */
export async function rejectPhoto(db: Db, submission: WithId<Submission>, actor: ReviewActor, reason: string | null, reasons: readonly string[] = [], deps: ReviewDeps = defaultReviewDeps): Promise<RejectResult> {
  if (submission.retentionStatus === 'pending_erasure' || submission.retentionStatus === 'erasing' || submission.retentionStatus === 'erased' || submission.reviewStatus !== 'pending_review') {
    return { ok: false, reason: 'not_reviewable', message: 'This photo is not waiting for a decision' };
  }
  const at = deps.now();
  const won = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submission._id, reviewStatus: 'pending_review', retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
    {
      $set: {
        reviewStatus: 'rejected',
        reviewNotes: reason,
        rejectReasons: [...reasons],
        isShareVisible: false,
        updatedAt: at,
      },
      $push: { reviewHistory: { action: 'reject', by: actorName(actor), at, reason, ...(reasons.length > 0 ? { reasons: [...reasons] } : {}) } } as Document,
    }
  );
  if (won.matchedCount === 0) return { ok: false, reason: 'not_reviewable', message: 'Someone else already decided on this photo' };

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  try {
    // An already-hidden photo rejected again keeps the same visibility and gets no duplicate email. If it was public before reopening, the guest does get the final decline result.
    if (submission.photoReview?.returnedAt && submission.photoReview.returnedWasPubliclyVisible !== true) return { ok: true, email };
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

/** Reopens an approved or rejected photo for the normal one-at-a-time review flow. */
export async function returnPhotoToVetting(db: Db, submission: WithId<Submission>, actor: ReviewActor, deps: ReviewDeps = defaultReviewDeps): Promise<ReturnToVettingResult> {
  if (submission.retentionStatus === 'pending_erasure' || submission.retentionStatus === 'erasing' || submission.retentionStatus === 'erased' || (submission.reviewStatus !== 'approved' && submission.reviewStatus !== 'rejected') || !submission.photoReview) {
    return { ok: false, reason: 'not_reviewable', message: 'This photo cannot be returned to vetting' };
  }
  const at = deps.now();
  const wasVisible = isPubliclyVisible(visibilityInputOf(submission));
  const won = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submission._id, reviewStatus: submission.reviewStatus, retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] } },
    {
      $set: {
        reviewStatus: 'pending_review',
        isShareVisible: false,
        'photoReview.returnedAt': at,
        'photoReview.returnedFromStatus': submission.reviewStatus,
        'photoReview.returnedWasPubliclyVisible': wasVisible,
        updatedAt: at,
      },
      $push: { reviewHistory: { action: 'return_to_vetting', by: actorName(actor), at, reason: null } } as Document,
    }
  );
  if (!won.matchedCount) return { ok: false, reason: 'not_reviewable', message: 'Someone else already changed this photo' };

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  if (wasVisible && submission.shareToken) {
    try {
      const event = await resolveEventForSubmission(db, submission).catch(() => null);
      const result = await deps.sendUnderReview(submission, event, approvedShareUrl(submission.shareToken), undefined, await themeOf(db, event), await textsOf(db, event), await legalOf(db, event));
      email = result.sent ? 'sent' : 'skipped' in result && result.skipped ? 'skipped' : 'failed';
    } catch (error) {
      email = 'failed';
      logWarn('photo_vetting.under_review_email_failed', 'The further-review email could not be sent', { submissionId: String(submission._id), error: errorMessage(error) });
    }
  }
  return { ok: true, email };
}
