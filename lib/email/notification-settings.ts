/**
 * The notification settings of an event as a request may set them (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E7): only the fields that are known, only valid values, and **only what the
 * editor chose**. Nothing is filled in with a default: a missing field follows the default of the five e-mail types (lib/email/types.ts), so a later change of a default reaches every
 * event that never chose (the old normaliser stored the defaults as if they were the editor's own). Pure; unit-tested in notification-settings.test.ts.
 */

import { BODY_MAX, SUBJECT_MAX, parseTypeSettings } from '@/lib/email/types';

const SWITCHES = [
  'submissionResultEmailEnabled',
  'submissionResultEmailSendAfterSave',
  'submissionResultEmailSendAfterRelatedPhotosReady',
  'submissionResultEmailSendAfterTryOnResubmissionApproved',
] as const;

const SUBJECTS = [
  'submissionResultEmailSubject',
  'submissionResultEmailSubjectAfterSave',
  'submissionResultEmailSubjectAfterRelatedPhotosReady',
  'submissionResultEmailSubjectAfterTryOnResubmissionApproved',
] as const;

const BODIES = [
  'submissionResultEmailBody',
  'submissionResultEmailBodyAfterSave',
  'submissionResultEmailBodyAfterRelatedPhotosReady',
  'submissionResultEmailBodyAfterTryOnResubmissionApproved',
] as const;

const SENDER_MAX = 120;
const URL_MAX = 500;

const clean = (value: unknown, max: number, newlines = false): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = (newlines ? value.replace(/\r\n?/g, '\n') : value).trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

function webAddress(value: unknown): string | undefined {
  const text = clean(value, URL_MAX);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? text : undefined;
  } catch {
    return undefined;
  }
}

export function sanitizeNotificationSettings(value: unknown): Record<string, unknown> {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of SWITCHES) if (typeof source[key] === 'boolean') out[key] = source[key];
  for (const key of SUBJECTS) {
    const text = clean(source[key], SUBJECT_MAX);
    if (text) out[key] = text;
  }
  for (const key of BODIES) {
    const text = clean(source[key], BODY_MAX, true);
    if (text) out[key] = text;
  }
  const sender = clean(source.submissionResultEmailSenderName, SENDER_MAX);
  if (sender) out.submissionResultEmailSenderName = sender;
  const terms = webAddress(source.termsUrl);
  if (terms) out.termsUrl = terms;
  const types = parseTypeSettings(source.types);
  if (Object.keys(types).length > 0) out.types = types;
  return out;
}
