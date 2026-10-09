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

/** The two try-on e-mails of today (an event that uses try-on): their switch, subject and message are the older fields of the notification settings. */
export interface LegacyModePatch {
  enabled?: boolean;
  subject?: string | null;
  body?: string | null;
}

export interface NotificationsPatch {
  /** The five types: replaces what was stored for them (the Emails page sends all it knows). */
  types?: unknown;
  /** Null takes the stored value away (the default applies). */
  senderName?: string | null;
  termsUrl?: string | null;
  tryOn?: { related?: LegacyModePatch; resubmission?: LegacyModePatch };
}

const LEGACY_APPROVED_KEYS = [
  'submissionResultEmailEnabled',
  'submissionResultEmailSendAfterSave',
  'submissionResultEmailSubject',
  'submissionResultEmailBody',
  'submissionResultEmailSubjectAfterSave',
  'submissionResultEmailBodyAfterSave',
] as const;

/**
 * The notification settings after the Emails page saved (epic 463, E3): what was stored, with the five types replaced, the sender and the terms link set or taken away, and the two try-on
 * e-mails changed. The page owns the approved e-mail now, so the old master switch and the old after-save pair are taken away when the types are saved (the new `types.approved` holds
 * what they meant: the page writes a stored off or an own text there before they go). Everything else stored stays. Pure; unit-tested in notification-settings.test.ts.
 */
export function mergeNotificationSettings(existing: unknown, patch: NotificationsPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { ...sanitizeNotificationSettings(existing) };
  if (patch.types !== undefined) {
    for (const key of LEGACY_APPROVED_KEYS) delete out[key];
    const types = parseTypeSettings(patch.types);
    if (Object.keys(types).length > 0) out.types = types;
    else delete out.types;
  }
  const set = (key: string, value: string | boolean | null | undefined) => {
    if (value === null || value === undefined || value === '') delete out[key];
    else out[key] = value;
  };
  if (patch.senderName !== undefined) set('submissionResultEmailSenderName', patch.senderName);
  if (patch.termsUrl !== undefined) set('termsUrl', patch.termsUrl);
  const modes = [
    ['related', 'submissionResultEmailSendAfterRelatedPhotosReady', 'submissionResultEmailSubjectAfterRelatedPhotosReady', 'submissionResultEmailBodyAfterRelatedPhotosReady'],
    ['resubmission', 'submissionResultEmailSendAfterTryOnResubmissionApproved', 'submissionResultEmailSubjectAfterTryOnResubmissionApproved', 'submissionResultEmailBodyAfterTryOnResubmissionApproved'],
  ] as const;
  for (const [mode, switchKey, subjectKey, bodyKey] of modes) {
    const change = patch.tryOn?.[mode];
    if (!change) continue;
    if (typeof change.enabled === 'boolean') out[switchKey] = change.enabled;
    if (change.subject !== undefined) set(subjectKey, change.subject);
    if (change.body !== undefined) set(bodyKey, change.body);
  }
  // Run the result through the same checks as a request: nothing invalid is stored.
  return sanitizeNotificationSettings(out);
}
