import { ObjectId, type Db, type WithId } from 'mongodb';
import { COLLECTIONS, type Event, type Submission, type TryOnJob } from '@/lib/db/schemas';
import { normalizeEventSharePageSettings, type EventSharePageSettings } from '@/lib/events/share-page-settings';
import { listApprovedShareVariants } from '@/lib/tryon/publication';
import { sendSubmissionResultEmail, type SubmissionNotificationResult, type SubmissionNotificationInput } from '@/lib/email/submission-notification';
import { sanitizeEmail } from '@/lib/security/sanitize';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { DEFAULT_EVENT_TERMS_URL } from '@/lib/email/submission-template-defaults';

export interface SubmissionEmailPolicy {
  enabled: boolean;
  sendAfterSave: boolean;
  sendAfterRelatedPhotosReady: boolean;
  sendAfterTryOnResubmissionApproved: boolean;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
  subjectTemplateAfterSave?: string | null;
  bodyTemplateAfterSave?: string | null;
  subjectTemplateAfterRelatedPhotosReady?: string | null;
  bodyTemplateAfterRelatedPhotosReady?: string | null;
  subjectTemplateAfterTryOnResubmissionApproved?: string | null;
  bodyTemplateAfterTryOnResubmissionApproved?: string | null;
  termsUrl: string;
}

export interface SubmissionEmailRecipient {
  email: string | null;
  name: string | null;
}

export interface SubmissionShareReadinessResult {
  ready: boolean;
  required: string[];
  missing: string[];
}

const PUBLIC_BASE_URL = getConfiguredSiteUrl();

function hasOwnProperty(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTemplate(value: unknown, maxLength: number, normalizeNewlines = false): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const normalized = normalizeNewlines
    ? trimmed.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    : trimmed;
  return normalized.slice(0, maxLength);
}

function hasTryOnVariantUrl(variant: {
  imageUrl?: string | null;
  metadata?: unknown;
  finalImageUrl?: string | null;
}): boolean {
  if (readString(variant.imageUrl) !== null) {
    return true;
  }
  if (readString(variant.finalImageUrl) !== null) {
    return true;
  }

  const metadata =
    variant.metadata && typeof variant.metadata === 'object' ? variant.metadata as { tryOnRawResultUrl?: unknown } : {};
  return readString(metadata.tryOnRawResultUrl) !== null;
}

export function resolveSubmissionResultEmailRecipient(submission: {
  userInfo?: { name?: string; email?: string } | null;
  userEmail?: string;
  userName?: string | null;
}): SubmissionEmailRecipient {
  const name = readString(submission.userInfo?.name) || readString(submission.userName) || 'there';
  const candidateEmail =
    readString(submission.userInfo?.email) ||
    (submission.userEmail && submission.userEmail !== 'anonymous@event' ? submission.userEmail : null);

  return {
    name,
    email: sanitizeEmail(candidateEmail || ''),
  };
}

export function normalizeSubmissionEmailPolicy(value: unknown): SubmissionEmailPolicy {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const enabled = Boolean(source.submissionResultEmailEnabled);

  const hasExplicitAfterSave = hasOwnProperty(source, 'submissionResultEmailSendAfterSave');
  const hasExplicitAfterRelated = hasOwnProperty(source, 'submissionResultEmailSendAfterRelatedPhotosReady');
  const hasExplicitAfterTryOnResubmissionApproved = hasOwnProperty(
    source,
    'submissionResultEmailSendAfterTryOnResubmissionApproved'
  );

  const legacySubject = readTemplate(source.submissionResultEmailSubject, 180);
  const legacyBody = readTemplate(source.submissionResultEmailBody, 5000, true);
  const subjectTemplateAfterSave = readTemplate(
    source.submissionResultEmailSubjectAfterSave,
    180
  ) || legacySubject;
  const bodyTemplateAfterSave =
    readTemplate(source.submissionResultEmailBodyAfterSave, 5000, true) || legacyBody;
  const subjectTemplateAfterRelatedPhotosReady =
    readTemplate(source.submissionResultEmailSubjectAfterRelatedPhotosReady, 180) || legacySubject;
  const bodyTemplateAfterRelatedPhotosReady =
    readTemplate(source.submissionResultEmailBodyAfterRelatedPhotosReady, 5000, true) || legacyBody;
  const subjectTemplateAfterTryOnResubmissionApproved =
    readTemplate(source.submissionResultEmailSubjectAfterTryOnResubmissionApproved, 180) ||
    subjectTemplateAfterRelatedPhotosReady ||
    legacySubject;
  const bodyTemplateAfterTryOnResubmissionApproved =
    readTemplate(source.submissionResultEmailBodyAfterTryOnResubmissionApproved, 5000, true) ||
    bodyTemplateAfterRelatedPhotosReady ||
    legacyBody;

  return {
    enabled,
    sendAfterSave: enabled
      ? hasExplicitAfterSave
        ? Boolean(source.submissionResultEmailSendAfterSave)
        : true
      : false,
    sendAfterRelatedPhotosReady: enabled
      ? hasExplicitAfterRelated
        ? Boolean(source.submissionResultEmailSendAfterRelatedPhotosReady)
        : false
      : false,
    sendAfterTryOnResubmissionApproved: enabled
      ? hasExplicitAfterTryOnResubmissionApproved
        ? Boolean(source.submissionResultEmailSendAfterTryOnResubmissionApproved)
        : false
      : false,
    subjectTemplate: legacySubject || null,
    bodyTemplate: legacyBody || null,
    subjectTemplateAfterSave,
    bodyTemplateAfterSave,
    subjectTemplateAfterRelatedPhotosReady,
    bodyTemplateAfterRelatedPhotosReady,
    subjectTemplateAfterTryOnResubmissionApproved,
    bodyTemplateAfterTryOnResubmissionApproved,
    termsUrl: readString(source.termsUrl) || DEFAULT_EVENT_TERMS_URL,
  };
}

export function buildSubmissionShareUrl(submissionId: string, baseUrl = PUBLIC_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, '')}/share/${submissionId}`;
}

export async function resolveEventForSubmission(
  db: Db,
  submission: Pick<Submission, 'eventId' | 'eventIds'>
): Promise<WithId<Event> | null> {
  const eventIds = new Set<string>();

  if (submission.eventId && readString(submission.eventId)) {
    eventIds.add(readString(submission.eventId)!);
  }

  if (Array.isArray(submission.eventIds)) {
    for (const eventId of submission.eventIds) {
      const value = readString(eventId);
      if (value) {
        eventIds.add(value);
      }
    }
  }

  if (eventIds.size === 0) {
    return null;
  }

  const orClauses: Array<Record<string, unknown>> = [];
  for (const eventId of eventIds) {
    orClauses.push({ eventId });
    if (ObjectId.isValid(eventId)) {
      orClauses.push({ _id: new ObjectId(eventId) });
    }
  }

  return db.collection<Event>(COLLECTIONS.EVENTS).findOne({ $or: orClauses });
}

export function normalizeSharePageSettings(value: unknown): EventSharePageSettings {
  return normalizeEventSharePageSettings(value);
}

export async function evaluateSubmissionShareReadiness(
  db: Db,
  sourceSubmission: WithId<Submission>,
  sharePageSettingsOverride?: EventSharePageSettings
): Promise<SubmissionShareReadinessResult> {
  const sharePage = sharePageSettingsOverride
    ? sharePageSettingsOverride
    : normalizeSharePageSettings((await resolveEventForSubmission(db, sourceSubmission))?.sharePage);

  const required: string[] = [];
  const missing: string[] = [];

  const originalCaptureUrl =
    readString(sourceSubmission.tryOnRequest?.sourceImageUrl) || readString(sourceSubmission.originalImageUrl);
  const cameraResultUrl = readString(sourceSubmission.imageUrl) || readString(sourceSubmission.finalImageUrl);

  if (sharePage.includeOriginalCapture) {
    required.push('originalCapture');
    if (!originalCaptureUrl) {
      missing.push('originalCapture');
    }
  }

  if (sharePage.includeCameraResult) {
    required.push('cameraResult');
    if (!cameraResultUrl) {
      missing.push('cameraResult');
    }
  }

  if (
    sharePage.includeTryOnResult ||
    sharePage.includeFramedTryOnResult ||
    sharePage.includeCheckedInTryOnResult
  ) {
    const variants = await listApprovedShareVariants(db, sourceSubmission._id.toString());
    const hasCheckedInTryOnResult = sharePage.includeCheckedInTryOnResult
      ? variants.some((variant) => hasTryOnVariantUrl(variant))
      : true;
    const hasTryOnResult = sharePage.includeTryOnResult
      ? variants.some((variant) => {
          const metadata =
            variant.metadata && typeof variant.metadata === 'object'
              ? variant.metadata as { tryOnRawResultUrl?: unknown; compositionEngine?: unknown; finalImageUrl?: unknown }
              : {};
          return readString(variant.imageUrl) !== null && readString(metadata.tryOnRawResultUrl) !== null;
        })
      : true;

    const hasFramedTryOnResult = sharePage.includeFramedTryOnResult
      ? variants.some((variant) => {
          const metadata =
            variant.metadata && typeof variant.metadata === 'object'
              ? variant.metadata as { tryOnRawResultUrl?: unknown; compositionEngine?: unknown; finalImageUrl?: unknown }
              : {};
          const compositionEngine = readString(metadata.compositionEngine);
          const resultUrl = readString(variant.imageUrl) || readString(variant.finalImageUrl);
          return compositionEngine === 'motogp_leather_magic_framed' && Boolean(resultUrl);
        })
      : true;

    if (sharePage.includeTryOnResult) {
      required.push('tryOnResult');
      if (!hasTryOnResult) {
        missing.push('tryOnResult');
      }
    }

    if (sharePage.includeFramedTryOnResult) {
      required.push('framedTryOnResult');
      if (!hasFramedTryOnResult) {
        missing.push('framedTryOnResult');
      }
    }

    if (sharePage.includeCheckedInTryOnResult) {
      required.push('checkedInTryOnResult');
      if (!hasCheckedInTryOnResult) {
        missing.push('checkedInTryOnResult');
      }
    }
  }

  return {
    required,
    missing,
    ready: missing.length === 0,
  };
}

export interface SendSubmissionEmailMetadataResult {
  sent: boolean;
  shouldRetry: boolean;
  metadataPatch: Record<string, unknown>;
}

type SubmissionEmailMode = 'after_save' | 'after_related' | 'after_tryon_resubmission_approved';

function buildModePatch(mode: SubmissionEmailMode): Record<string, unknown> {
  if (mode === 'after_save') {
    return {
      'metadata.emailSentAfterSave': true,
    };
  }

  if (mode === 'after_tryon_resubmission_approved') {
    return {
      'metadata.emailSentAfterTryOnResubmissionApproved': true,
    };
  }

  return {
    'metadata.emailSentAfterRelatedPhotos': true,
  };
}

function buildFailureModePatch(mode: SubmissionEmailMode): Record<string, unknown> {
  if (mode === 'after_save') {
    return {
      'metadata.emailSentAfterSave': false,
    };
  }

  if (mode === 'after_tryon_resubmission_approved') {
    return {
      'metadata.emailSentAfterTryOnResubmissionApproved': false,
    };
  }

  return {
    'metadata.emailSentAfterRelatedPhotos': false,
  };
}

export function buildEmailMetadataPatch(
  mode: SubmissionEmailMode,
  result: SubmissionNotificationResult,
  shareUrl: string
): SendSubmissionEmailMetadataResult {
  const now = new Date().toISOString();

  if (result.sent) {
    return {
      sent: true,
      shouldRetry: false,
      metadataPatch: {
        ...buildModePatch(mode),
        'metadata.emailSent': true,
        'metadata.emailSentAt': now,
        'metadata.emailRecipient': result.recipientEmail,
        'metadata.emailProvider': result.provider,
        'metadata.emailMessageId': result.messageId ?? null,
        'metadata.emailSkipReason': null,
        'metadata.emailError': null,
        'metadata.emailSkippedAt': null,
        'metadata.emailFailedAt': null,
        'metadata.emailSendAfterRelatedPending': false,
        'metadata.shareUrl': shareUrl,
      },
    };
  }

  if (result.sent === false && result.skipped) {
    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        ...buildModePatch(mode),
        ...buildFailureModePatch(mode),
        'metadata.emailSent': false,
        'metadata.emailSkippedAt': now,
        'metadata.emailSkipReason': result.reason,
        'metadata.emailError': null,
        'metadata.shareUrl': shareUrl,
      },
    };
  }

  return {
    sent: false,
    shouldRetry: true,
    metadataPatch: {
      ...buildModePatch(mode),
      ...buildFailureModePatch(mode),
      'metadata.emailSent': false,
      'metadata.emailFailedAt': now,
      'metadata.emailError': result.error || 'Unknown email delivery error',
      'metadata.shareUrl': shareUrl,
      'metadata.emailRecipient': result.recipientEmail,
    },
  };
}

export function buildSubmissionEmailInput(
  submission: {
    userInfo?: { name?: string; email?: string } | null;
    userEmail?: string;
    userName?: string | null;
  },
  shareUrl: string,
  policy: SubmissionEmailPolicy,
  eventName: string | null,
  mode: SubmissionEmailMode = 'after_save'
): SubmissionNotificationInput | null {
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  if (!recipient.email) {
    return null;
  }

  const subjectTemplate =
    mode === 'after_save'
      ? policy.subjectTemplateAfterSave || policy.subjectTemplate
      : mode === 'after_tryon_resubmission_approved'
        ? policy.subjectTemplateAfterTryOnResubmissionApproved || policy.subjectTemplateAfterRelatedPhotosReady || policy.subjectTemplate
        : policy.subjectTemplateAfterRelatedPhotosReady || policy.subjectTemplate;
  const bodyTemplate =
    mode === 'after_save'
      ? policy.bodyTemplateAfterSave || policy.bodyTemplate
      : mode === 'after_tryon_resubmission_approved'
        ? policy.bodyTemplateAfterTryOnResubmissionApproved || policy.bodyTemplateAfterRelatedPhotosReady || policy.bodyTemplate
        : policy.bodyTemplateAfterRelatedPhotosReady || policy.bodyTemplate;

  return {
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    eventName,
    shareUrl,
    termsUrl: policy.termsUrl,
    subjectTemplate,
    bodyTemplate,
  };
}

export async function sendSubmissionResultEmailByPolicy(
  submission: Parameters<typeof buildSubmissionEmailInput>[0],
  eventName: string | null,
  shareUrl: string,
  policy: SubmissionEmailPolicy,
  mode: SubmissionEmailMode
): Promise<SendSubmissionEmailMetadataResult> {
  const input = buildSubmissionEmailInput(submission, shareUrl, policy, eventName, mode);
  if (!input) {
    const now = new Date().toISOString();

    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        ...buildFailureModePatch(mode),
        'metadata.emailSent': false,
        'metadata.emailSkippedAt': now,
        'metadata.emailSkipReason': 'missing_recipient',
        'metadata.shareUrl': shareUrl,
        'metadata.emailSendAfterRelatedPending': false,
      },
    };
  }

  return buildEmailMetadataPatch(mode, await sendSubmissionResultEmail(input), shareUrl);
}

export async function dispatchPendingRelatedEmailForSubmission(
  db: Db,
  sourceSubmission: WithId<Submission>,
  baseUrl = PUBLIC_BASE_URL
): Promise<SendSubmissionEmailMetadataResult | null> {
  const event = await resolveEventForSubmission(db, sourceSubmission);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications);

  if (!policy.enabled || !policy.sendAfterRelatedPhotosReady) {
    return null;
  }

  if (sourceSubmission.metadata?.emailSentAfterRelatedPhotos) {
    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        'metadata.emailSendAfterRelatedPending': false,
      },
    };
  }

  const sharePageSettings = normalizeSharePageSettings(event?.sharePage);
  const readiness = await evaluateSubmissionShareReadiness(db, sourceSubmission, sharePageSettings);
  if (!readiness.ready) {
    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        'metadata.emailSendAfterRelatedPending': true,
      },
    };
  }

  const shareUrl = buildSubmissionShareUrl(sourceSubmission._id.toString(), baseUrl);
  const result = await sendSubmissionResultEmailByPolicy(
    sourceSubmission,
    event?.name || null,
    shareUrl,
    policy,
    'after_related'
  );

  if (!result.shouldRetry) {
    result.metadataPatch['metadata.emailSendAfterRelatedPending'] = false;
  }

  return result;
}

function isTryOnRerunJob(job: TryOnJob | null): boolean {
  if (!job) return false;
  return Boolean(job.request?.rerunOfJobId) || job.requestHash.includes('::rerun:');
}

export async function dispatchTryOnResubmissionApprovalEmailForSubmission(
  db: Db,
  sourceSubmission: WithId<Submission>,
  resultSubmission: WithId<Submission>,
  baseUrl = PUBLIC_BASE_URL
): Promise<SendSubmissionEmailMetadataResult | null> {
  const sourceJobId = readString(resultSubmission.sourceJobId);
  if (!sourceJobId) {
    return null;
  }

  const sourceJob = await db
    .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
    .findOne({ jobId: sourceJobId });
  if (!isTryOnRerunJob(sourceJob)) {
    return null;
  }

  const event = await resolveEventForSubmission(db, sourceSubmission);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications);
  if (!policy.enabled || !policy.sendAfterTryOnResubmissionApproved) {
    return null;
  }

  if (resultSubmission.metadata?.emailSentAfterTryOnResubmissionApproved) {
    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {},
    };
  }

  const shareUrl = buildSubmissionShareUrl(sourceSubmission._id.toString(), baseUrl);
  return sendSubmissionResultEmailByPolicy(
    sourceSubmission,
    event?.name || null,
    shareUrl,
    policy,
    'after_tryon_resubmission_approved'
  );
}

export async function dispatchPendingSubmissionEmailForSubmission(
  db: Db,
  sourceSubmission: WithId<Submission>,
  baseUrl = PUBLIC_BASE_URL
): Promise<SendSubmissionEmailMetadataResult | null> {
  const event = await resolveEventForSubmission(db, sourceSubmission);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications);

  if (!policy.enabled) {
    return null;
  }

  if (sourceSubmission.metadata?.emailSent) {
    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        'metadata.emailSendAfterRelatedPending': false,
      },
    };
  }

  const submissionId = sourceSubmission._id.toString();
  const shareUrl = buildSubmissionShareUrl(submissionId, baseUrl);
  const eventName = event?.name || null;

  const mergedResult: SendSubmissionEmailMetadataResult = {
    sent: false,
    shouldRetry: false,
    metadataPatch: {},
  };

  if (policy.sendAfterSave && sourceSubmission.metadata?.emailSentAfterSave !== true) {
    const afterSaveResult = await sendSubmissionResultEmailByPolicy(
      sourceSubmission,
      eventName,
      shareUrl,
      policy,
      'after_save'
    );

    mergedResult.shouldRetry = mergedResult.shouldRetry || afterSaveResult.shouldRetry;
    mergedResult.sent = mergedResult.sent || afterSaveResult.sent;
    mergedResult.metadataPatch = {
      ...mergedResult.metadataPatch,
      ...afterSaveResult.metadataPatch,
    };

    if (afterSaveResult.sent) {
      return {
        ...mergedResult,
        metadataPatch: {
          ...mergedResult.metadataPatch,
          'metadata.emailSendAfterRelatedPending': false,
        },
      };
    }

    // If there is no recipient we keep the request open and do not try related mode here.
    if (afterSaveResult.metadataPatch['metadata.emailSkipReason'] === 'missing_recipient') {
      return {
        sent: false,
        shouldRetry: false,
        metadataPatch: {
          ...mergedResult.metadataPatch,
          'metadata.emailSendAfterRelatedPending': false,
        },
      };
    }
  }

  if (policy.sendAfterRelatedPhotosReady) {
    const relatedResult = await dispatchPendingRelatedEmailForSubmission(db, sourceSubmission, baseUrl);
    if (relatedResult) {
      mergedResult.shouldRetry = mergedResult.shouldRetry || relatedResult.shouldRetry;
      mergedResult.sent = mergedResult.sent || relatedResult.sent;
      mergedResult.metadataPatch = {
        ...mergedResult.metadataPatch,
        ...relatedResult.metadataPatch,
      };
    }
  }

  return mergedResult;
}
