import { ObjectId, type Db, type WithId } from 'mongodb';
import { COLLECTIONS, type Event, type Submission } from '@/lib/db/schemas';
import { normalizeEventSharePageSettings, type EventSharePageSettings } from '@/lib/events/share-page-settings';
import { listApprovedShareVariants } from '@/lib/tryon/publication';
import { sendSubmissionResultEmail, type SubmissionNotificationResult, type SubmissionNotificationInput } from '@/lib/email/submission-notification';
import { sanitizeEmail } from '@/lib/security/sanitize';

export interface SubmissionEmailPolicy {
  enabled: boolean;
  sendAfterSave: boolean;
  sendAfterRelatedPhotosReady: boolean;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
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

const PUBLIC_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

function hasOwnProperty(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

  const subject =
    typeof source.submissionResultEmailSubject === 'string'
      ? source.submissionResultEmailSubject.trim().slice(0, 180)
      : '';
  const body =
    typeof source.submissionResultEmailBody === 'string'
      ? source.submissionResultEmailBody.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(0, 5000)
      : '';

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
    subjectTemplate: subject || null,
    bodyTemplate: body || null,
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

  if (sharePage.includeTryOnResult || sharePage.includeFramedTryOnResult) {
    const variants = await listApprovedShareVariants(db, sourceSubmission._id.toString());
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

function buildModePatch(mode: 'after_save' | 'after_related'): Record<string, unknown> {
  if (mode === 'after_save') {
    return {
      'metadata.emailSentAfterSave': true,
    };
  }

  return {
    'metadata.emailSentAfterRelatedPhotos': true,
  };
}

function buildFailureModePatch(mode: 'after_save' | 'after_related'): Record<string, unknown> {
  if (mode === 'after_save') {
    return {
      'metadata.emailSentAfterSave': false,
    };
  }

  return {
    'metadata.emailSentAfterRelatedPhotos': false,
  };
}

export function buildEmailMetadataPatch(
  mode: 'after_save' | 'after_related',
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
  eventName: string | null
): SubmissionNotificationInput | null {
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  if (!recipient.email) {
    return null;
  }

  return {
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    eventName,
    shareUrl,
    subjectTemplate: policy.subjectTemplate,
    bodyTemplate: policy.bodyTemplate,
  };
}

export async function sendSubmissionResultEmailByPolicy(
  submission: Parameters<typeof buildSubmissionEmailInput>[0],
  eventName: string | null,
  shareUrl: string,
  policy: SubmissionEmailPolicy,
  mode: 'after_save' | 'after_related'
): Promise<SendSubmissionEmailMetadataResult> {
  const input = buildSubmissionEmailInput(submission, shareUrl, policy, eventName);
  if (!input) {
    const now = new Date().toISOString();

    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        ...(mode === 'after_save'
          ? { 'metadata.emailSentAfterSave': false }
          : { 'metadata.emailSentAfterRelatedPhotos': false }),
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
