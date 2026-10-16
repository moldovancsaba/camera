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
  | { ok: true; email: 'sent' | 'skipped' | 'failed'; emailDeferred?: true }
  | { ok: false; reason: ReviewFailure; message: string };

export type RejectResult =
  | { ok: true; email: 'sent' | 'skipped' | 'failed'; emailDeferred?: true }
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

  const consentStillPending = submission.consentStatus === 'pending' || submission.consentStatus === 'expiring' || submission.consentStatus === 'expired';
  const approvedSubmission = { ...submission, reviewStatus: 'approved' as const, isShareVisible: review.shareOptIn === true };
  const shouldAttemptApprovalEmail = Boolean(
    submission.shareToken && !consentStillPending &&
    (reopeningExistingImage || submission.metadata?.emailSentAfterSave !== true) &&
    isPubliclyVisible(visibilityInputOf(approvedSubmission)),
  );
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
        ...(shouldAttemptApprovalEmail ? { 'metadata.approvalEmailPending': true } : {}),
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

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  let emailDeferred = false;
  if (shouldAttemptApprovalEmail) {
    const result = await sendApprovedLinkForSubmission(db, { ...approvedSubmission, _id: submission._id }, deps, reopeningExistingImage);
    emailDeferred = result === 'deferred';
    email = result === 'deferred' ? 'skipped' : result;
  }

  // The plain photo is not deleted here (issue 509): it is the only unframed copy of the user's picture until its ImgBB copy is verified. The follow-up work makes that copy after the answer and
  // deletes the Blob file only then (variant B); a failure there never touches the approval, and until then `photoReview.photoUrl` keeps pointing at the file so deleting the submission deletes it.
  try {
    if (!photo || !review.photoUrl) return { ok: true, email, ...(emailDeferred ? { emailDeferred: true as const } : {}) };
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

  return { ok: true, email, ...(emailDeferred ? { emailDeferred: true } : {}) };
}

type DecisionEmailStatus = 'sent' | 'skipped' | 'failed' | 'deferred';

function decisionEmailClaimFilter(submissionId: ObjectId, reviewStatus: 'approved' | 'rejected', claimAt: string): Document {
  const parsedClaimAt = Date.parse(claimAt);
  const staleBefore = new Date((Number.isFinite(parsedClaimAt) ? parsedClaimAt : Date.now()) - 5 * 60_000).toISOString();
  return {
    _id: submissionId,
    reviewStatus,
    $or: [
      { 'metadata.decisionEmailSending': { $ne: true } },
      { 'metadata.decisionEmailSendingAt': { $lt: staleBefore } },
    ],
  };
}

async function sendApprovedLinkForSubmission(db: Db, submission: Submission | null, deps: ReviewDeps, force = false): Promise<DecisionEmailStatus> {
  if (!submission?._id) return 'skipped';
  const submissionId = submission._id as ObjectId;
  const initial = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
  if (!initial || initial.reviewStatus !== 'approved') return 'skipped';

  const claimAt = deps.now();
  const claimFilter = decisionEmailClaimFilter(submissionId, 'approved', claimAt);
  if (!force) {
    claimFilter['metadata.emailSentAfterSave'] = { $ne: true };
    claimFilter['metadata.emailSent'] = { $ne: true };
  }
  const claimed = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
    claimFilter,
    { $set: { 'metadata.decisionEmailSending': true, 'metadata.decisionEmailSendingAt': claimAt } },
  );
  if (!claimed.matchedCount) return 'skipped';

  try {
    const current = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
    if (!current || current.reviewStatus !== 'approved' || !isPubliclyVisible(visibilityInputOf({ ...current })) || !current.shareToken || !current.imageUrl || (!force && (current.metadata?.emailSentAfterSave === true || current.metadata?.emailSent === true))) {
      return 'skipped';
    }

    const event = await resolveEventForSubmission(db, current).catch(() => null);
    const shareUrl = approvedShareUrl(current.shareToken);
    const result = await deps.sendApproved(current, event, shareUrl, undefined, await themeOf(db, event), await textsOf(db, event), await legalOf(db, event));
    const patch = buildEmailMetadataPatch(result, shareUrl);
    const emailDeferred = patch.metadataPatch['metadata.emailSkipReason'] === 'missing_recipient';
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionId, reviewStatus: 'approved', 'metadata.decisionEmailSending': true },
      {
        $set: { ...patch.metadataPatch, ...(emailDeferred ? { 'metadata.approvalEmailPending': true } : {}) },
        ...(!emailDeferred ? { $unset: { 'metadata.approvalEmailPending': '' } } : {}),
      },
    );
    return patch.sent ? 'sent' : emailDeferred ? 'deferred' : patch.shouldRetry ? 'failed' : 'skipped';
  } catch (error) {
    logWarn('photo_vetting.approval_email_failed', 'The approval email could not be sent', { submissionId: String(submissionId), error: errorMessage(error) });
    return 'failed';
  } finally {
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionId, 'metadata.decisionEmailSending': true },
      { $unset: { 'metadata.decisionEmailSending': '', 'metadata.decisionEmailSendingAt': '' } },
    ).catch((error) => logWarn('photo_vetting.approval_email_claim_release_failed', 'The approval email claim could not be released', { submissionId: String(submissionId), error: errorMessage(error) }));
  }
}

/** Send the approved share link when a guest records consent after moderation has already approved the photo. */
export async function sendApprovedLinkAfterConsent(db: Db, submissionId: ObjectId, deps: ReviewDeps = defaultReviewDeps): Promise<'sent' | 'skipped' | 'failed'> {
  const submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
  if (!submission || submission.consentStatus !== 'received') return 'skipped';
  const result = await sendApprovedLinkForSubmission(db, submission, deps);
  return result === 'deferred' ? 'skipped' : result;
}

/**
 * The camera uploads as soon as the guest confirms the photo, before any post-capture login or contact page. A moderator can therefore
 * decide first. When that decision had no recipient, finish the decision e-mail as soon as the guest's identity is linked or entered.
 */
async function sendRejectedNoteForSubmission(db: Db, submissionId: ObjectId, deps: ReviewDeps): Promise<DecisionEmailStatus> {
  const claimAt = deps.now();
  const claim = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
    { ...decisionEmailClaimFilter(submissionId, 'rejected', claimAt), 'metadata.rejectionEmailPending': true },
    { $set: { 'metadata.decisionEmailSending': true, 'metadata.decisionEmailSendingAt': claimAt } },
  );
  if (!claim.matchedCount) return 'skipped';

  try {
    const submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
    if (!submission || submission.reviewStatus !== 'rejected' || submission.metadata?.rejectionEmailPending !== true) return 'skipped';
    const event = await resolveEventForSubmission(db, submission).catch(() => null);
    const result = await deps.sendNotApproved(
      submission,
      event,
      takeAnotherPhotoUrl(String(submission.eventId ?? event?._id ?? ''), undefined, event),
      undefined,
      await themeOf(db, event),
      await textsOf(db, event),
      await legalOf(db, event),
    );
    const at = deps.now();
    const missingRecipient = !result.sent && result.skipped && result.reason === 'missing_recipient';
    const providerFailed = !result.sent && !result.skipped;
    await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionId, reviewStatus: 'rejected', 'metadata.decisionEmailSending': true },
      {
        $set: {
          'metadata.rejectionEmailSent': result.sent,
          'metadata.rejectionEmailAt': at,
          'metadata.rejectionEmailSkipReason': result.sent ? null : result.skipped ? result.reason : null,
          ...(result.sent ? {
            'metadata.rejectionEmailRecipient': result.recipientEmail,
            'metadata.rejectionEmailProvider': result.provider,
            'metadata.rejectionEmailMessageId': result.messageId,
            'metadata.rejectionEmailError': null,
          } : providerFailed ? { 'metadata.rejectionEmailError': result.error } : {}),
          ...(missingRecipient ? { 'metadata.rejectionEmailPending': true } : {}),
        },
        ...(!missingRecipient ? { $unset: { 'metadata.rejectionEmailPending': '' } } : {}),
      },
    );
    return result.sent ? 'sent' : missingRecipient ? 'deferred' : providerFailed ? 'failed' : 'skipped';
  } catch (error) {
    logWarn('photo_vetting.rejection_email_failed', 'The not-approved email could not be sent', { submissionId: String(submissionId), error: errorMessage(error) });
    return 'failed';
  } finally {
    await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionId, 'metadata.decisionEmailSending': true },
      { $unset: { 'metadata.decisionEmailSending': '', 'metadata.decisionEmailSendingAt': '' } },
    ).catch((error) => logWarn('photo_vetting.rejection_email_claim_release_failed', 'The rejection email claim could not be released', { submissionId: String(submissionId), error: errorMessage(error) }));
  }
}

export async function sendPendingVettingEmailAfterIdentity(db: Db, submissionId: ObjectId, deps: ReviewDeps = defaultReviewDeps): Promise<DecisionEmailStatus> {
  let submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
  if (!submission) return 'skipped';

  const olderApprovalWasSkippedForMissingRecipient = submission.reviewStatus === 'approved' && submission.metadata?.emailSent === false && submission.metadata?.emailSkipReason === 'missing_recipient';
  if (olderApprovalWasSkippedForMissingRecipient && submission.metadata?.approvalEmailPending !== true) {
    await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionId, reviewStatus: 'approved', 'metadata.emailSent': false, 'metadata.emailSkipReason': 'missing_recipient' },
      { $set: { 'metadata.approvalEmailPending': true } },
    );
    submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
    if (!submission) return 'skipped';
  }

  if (submission.reviewStatus === 'approved' && submission.metadata?.approvalEmailPending === true) {
    return sendApprovedLinkForSubmission(db, submission, deps);
  }

  const olderRejectionWasSkipped = submission.reviewStatus === 'rejected' && submission.metadata?.rejectionEmailSent === false && Boolean(submission.metadata?.rejectionEmailAt);
  if (olderRejectionWasSkipped && submission.metadata?.rejectionEmailPending !== true) {
    await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
      { _id: submissionId, reviewStatus: 'rejected', 'metadata.rejectionEmailSent': false, 'metadata.rejectionEmailAt': { $exists: true } },
      { $set: { 'metadata.rejectionEmailPending': true } },
    );
  }
  if (submission.reviewStatus !== 'rejected' || (submission.metadata?.rejectionEmailPending !== true && !olderRejectionWasSkipped)) return 'skipped';
  return sendRejectedNoteForSubmission(db, submissionId, deps);
}

/** Let an event manager retry a missed approval email for an already-approved, public photo. */
export async function retryApprovedPhotoEmail(db: Db, submissionId: ObjectId, deps: ReviewDeps = defaultReviewDeps): Promise<'sent' | 'skipped' | 'failed'> {
  const submission = await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).findOne({ _id: submissionId });
  const result = await sendApprovedLinkForSubmission(db, submission, deps);
  return result === 'deferred' ? 'skipped' : result;
}

/**
 * `reasons` are the keys of the reject reasons the reviewer chose (lib/photo-vetting/vocabulary.ts, group `reject_reason`; the route has checked them against the event's list), kept on the photo
 * as `rejectReasons` and in the review history entry; `reason` is the free-text note. A photo rejected before reasons existed has neither, and the history entry carries `reasons` only when there are some.
 */
export async function rejectPhoto(db: Db, submission: WithId<Submission>, actor: ReviewActor, reason: string | null, reasons: readonly string[] = [], deps: ReviewDeps = defaultReviewDeps): Promise<RejectResult> {
  if (submission.reviewStatus !== 'pending_review') {
    return { ok: false, reason: 'not_reviewable', message: 'This photo is not waiting for a decision' };
  }
  const shouldSendRejectionEmail = !(submission.photoReview?.returnedAt && submission.photoReview.returnedWasPubliclyVisible !== true);
  const at = deps.now();
  const won = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submission._id, reviewStatus: 'pending_review' },
    {
      $set: {
        reviewStatus: 'rejected',
        reviewNotes: reason,
        rejectReasons: [...reasons],
        isShareVisible: false,
        ...(shouldSendRejectionEmail ? { 'metadata.rejectionEmailPending': true } : {}),
        updatedAt: at,
      },
      $push: { reviewHistory: { action: 'reject', by: actorName(actor), at, reason, ...(reasons.length > 0 ? { reasons: [...reasons] } : {}) } } as Document,
    }
  );
  if (won.matchedCount === 0) return { ok: false, reason: 'not_reviewable', message: 'Someone else already decided on this photo' };

  let email: 'sent' | 'skipped' | 'failed' = 'skipped';
  let emailDeferred = false;
  if (shouldSendRejectionEmail) {
    const result = await sendRejectedNoteForSubmission(db, submission._id, deps);
    emailDeferred = result === 'deferred';
    email = result === 'deferred' ? 'skipped' : result;
  }
  return { ok: true, email, ...(emailDeferred ? { emailDeferred: true } : {}) };
}

/** Reopens an approved or rejected photo for the normal one-at-a-time review flow. */
export async function returnPhotoToVetting(db: Db, submission: WithId<Submission>, actor: ReviewActor, deps: ReviewDeps = defaultReviewDeps): Promise<ReturnToVettingResult> {
  if ((submission.reviewStatus !== 'approved' && submission.reviewStatus !== 'rejected') || !submission.photoReview) {
    return { ok: false, reason: 'not_reviewable', message: 'This photo cannot be returned to vetting' };
  }
  const at = deps.now();
  const wasVisible = isPubliclyVisible(visibilityInputOf(submission));
  const won = await db.collection(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submission._id, reviewStatus: submission.reviewStatus },
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
