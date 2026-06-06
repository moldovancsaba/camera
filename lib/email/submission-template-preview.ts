import {
  DEFAULT_EVENT_TERMS_URL,
  DEFAULT_SUBMISSION_EMAIL_BODY,
  DEFAULT_SUBMISSION_EMAIL_SUBJECT,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
  DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT,
} from '@/lib/email/submission-template-defaults';
import {
  buildSubmissionShareUrl,
  normalizeSubmissionEmailPolicy,
  resolveSubmissionResultEmailRecipient,
  type SubmissionEmailPolicy,
} from '@/lib/email/submission-result-email';
import type { Event, Submission } from '@/lib/db/schemas';

export type SubmissionEmailTemplateType =
  | 'after_save'
  | 'after_related'
  | 'after_tryon_resubmission_approved';

export interface SubmissionEmailPreviewContext {
  recipientName: string;
  recipientEmail: string | null;
  eventName: string;
  shareUrl: string;
  termsUrl: string;
}

export interface EmailTemplateValidation {
  type: SubmissionEmailTemplateType;
  enabled: boolean;
  valid: boolean;
  missingPlaceholders: string[];
  missingValues: string[];
  warnings: string[];
  renderedSubject: string;
  renderedBodyPreview: string;
}

const REQUIRED_PLACEHOLDERS = ['{name}', '{event}', '{link}', '{terms}'] as const;

function normalizeTemplate(value: string | null | undefined, fallback: string, maxLength: number): string {
  const normalized = value?.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

function renderTemplate(template: string, context: SubmissionEmailPreviewContext): string {
  return template
    .replace(/\{name\}/gi, context.recipientName)
    .replace(/\{event\}/gi, context.eventName)
    .replace(/\{link\}/gi, context.shareUrl)
    .replace(/\{terms\}/gi, context.termsUrl);
}

function templateForType(policy: SubmissionEmailPolicy, type: SubmissionEmailTemplateType) {
  if (type === 'after_save') {
    return {
      enabled: policy.enabled && policy.sendAfterSave,
      subject:
        policy.subjectTemplateAfterSave ||
        policy.subjectTemplate ||
        DEFAULT_SUBMISSION_EMAIL_SUBJECT,
      body:
        policy.bodyTemplateAfterSave ||
        policy.bodyTemplate ||
        DEFAULT_SUBMISSION_EMAIL_BODY,
    };
  }

  if (type === 'after_tryon_resubmission_approved') {
    return {
      enabled: policy.enabled && policy.sendAfterTryOnResubmissionApproved,
      subject:
        policy.subjectTemplateAfterTryOnResubmissionApproved ||
        policy.subjectTemplateAfterRelatedPhotosReady ||
        policy.subjectTemplate ||
        DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT,
      body:
        policy.bodyTemplateAfterTryOnResubmissionApproved ||
        policy.bodyTemplateAfterRelatedPhotosReady ||
        policy.bodyTemplate ||
        DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY,
    };
  }

  return {
    enabled: policy.enabled && policy.sendAfterRelatedPhotosReady,
    subject:
      policy.subjectTemplateAfterRelatedPhotosReady ||
      policy.subjectTemplate ||
      DEFAULT_SUBMISSION_EMAIL_SUBJECT,
    body:
      policy.bodyTemplateAfterRelatedPhotosReady ||
      policy.bodyTemplate ||
      DEFAULT_SUBMISSION_EMAIL_BODY,
  };
}

export function buildSubmissionEmailPreviewContext(input: {
  event: Pick<Event, 'name' | 'notifications'>;
  submission?: Pick<Submission, '_id' | 'userInfo' | 'userEmail' | 'userName'> | null;
  baseUrl?: string;
}): SubmissionEmailPreviewContext {
  const recipient = input.submission
    ? resolveSubmissionResultEmailRecipient(input.submission)
    : { name: 'Sample Guest', email: 'sample@example.com' };
  const eventName = typeof input.event.name === 'string' && input.event.name.trim()
    ? input.event.name.trim()
    : 'your event';
  const termsUrl =
    typeof input.event.notifications?.termsUrl === 'string' && input.event.notifications.termsUrl.trim()
      ? input.event.notifications.termsUrl.trim()
      : DEFAULT_EVENT_TERMS_URL;
  const shareUrl = input.submission?._id
    ? buildSubmissionShareUrl(input.submission._id.toString(), input.baseUrl)
    : buildSubmissionShareUrl('sample-submission', input.baseUrl);

  return {
    recipientName: recipient.name || 'there',
    recipientEmail: recipient.email || null,
    eventName,
    shareUrl,
    termsUrl,
  };
}

export function validateSubmissionEmailTemplate(input: {
  type: SubmissionEmailTemplateType;
  event: Pick<Event, 'notifications'>;
  context: SubmissionEmailPreviewContext;
}): EmailTemplateValidation {
  const policy = normalizeSubmissionEmailPolicy(input.event.notifications);
  const selected = templateForType(policy, input.type);
  const subjectTemplate = normalizeTemplate(selected.subject, DEFAULT_SUBMISSION_EMAIL_SUBJECT, 180);
  const bodyTemplate = normalizeTemplate(selected.body, DEFAULT_SUBMISSION_EMAIL_BODY, 5000);
  const combinedTemplate = `${subjectTemplate}\n${bodyTemplate}`.toLowerCase();
  const missingPlaceholders = REQUIRED_PLACEHOLDERS.filter(
    (placeholder) => !combinedTemplate.includes(placeholder)
  );
  const missingValues = [
    input.context.recipientName ? null : 'name',
    input.context.eventName ? null : 'event',
    input.context.shareUrl ? null : 'link',
    input.context.termsUrl ? null : 'terms',
    input.context.recipientEmail ? null : 'recipientEmail',
  ].filter((value): value is string => Boolean(value));
  const warnings = [
    !policy.enabled ? 'Event result email delivery is disabled.' : null,
    !selected.enabled ? `Template type ${input.type} is not enabled for delivery.` : null,
    missingPlaceholders.length > 0
      ? `Template does not include required placeholders: ${missingPlaceholders.join(', ')}.`
      : null,
    input.type === 'after_tryon_resubmission_approved' &&
    bodyTemplate === (policy.bodyTemplateAfterRelatedPhotosReady || policy.bodyTemplate)
      ? 'Resubmission-approved template is falling back to another email body.'
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    type: input.type,
    enabled: selected.enabled,
    valid: missingPlaceholders.length === 0 && missingValues.length === 0,
    missingPlaceholders,
    missingValues,
    warnings,
    renderedSubject: renderTemplate(subjectTemplate, input.context).replace(/\s+/g, ' ').trim(),
    renderedBodyPreview: renderTemplate(bodyTemplate, input.context),
  };
}

export function validateSubmissionEmailTemplateMatrix(input: {
  event: Pick<Event, 'name' | 'notifications'>;
  submission?: Pick<Submission, '_id' | 'userInfo' | 'userEmail' | 'userName'> | null;
  baseUrl?: string;
}): EmailTemplateValidation[] {
  const context = buildSubmissionEmailPreviewContext(input);
  return (['after_save', 'after_related', 'after_tryon_resubmission_approved'] as SubmissionEmailTemplateType[])
    .map((type) => validateSubmissionEmailTemplate({ type, event: input.event, context }));
}
