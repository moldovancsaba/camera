/**
 * What the Emails page of an event shows (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E3): for each of the five types its switch (on or off, and whether the editor chose it or it follows
 * the default), the event's own subject and message (null when it follows the default), and the default subject and message in the event's language with the wordings written for its
 * partner and itself; the sender and the terms link; and, for an event that uses try-on, the two older try-on e-mails. Server side; unit-tested through the route.
 */

import type { Db, Document } from 'mongodb';
import { DEFAULT_SUBMISSION_EMAIL_SENDER_NAME, DEFAULT_EVENT_TERMS_URL, emailDefaults, emailTemplateIn } from '@/lib/email/submission-template-defaults';
import { normalizeSubmissionEmailPolicy } from '@/lib/email/submission-result-email';
import { EMAIL_TYPES, EMAIL_TYPE_INFO, typeDefaults, type EmailType } from '@/lib/email/types';
import type { UiLanguage } from '@/lib/i18n';
import { loadEventTexts } from '@/lib/i18n/overrides';

export interface EmailTypeView {
  type: EmailType;
  label: string;
  when: string;
  defaultOn: boolean;
  /** Whether it is on now. */
  enabled: boolean;
  /** The editor's stored choice of the switch; null = it follows the default. */
  chosen: boolean | null;
  /** The event's own subject and message; null = the default. */
  subject: string | null;
  body: string | null;
  defaultSubject: string;
  defaultBody: string;
  /** The label of the button, or null when the e-mail has none. */
  buttonLabel: string | null;
  /** Whether anything sends it yet. */
  sent: boolean;
}

export interface LegacyModeView {
  enabled: boolean;
  subject: string | null;
  body: string | null;
  defaultSubject: string;
  defaultBody: string;
}

export interface EventEmailsView {
  language: UiLanguage;
  eventName: string;
  types: EmailTypeView[];
  tryOn: { related: LegacyModeView; resubmission: LegacyModeView } | null;
  senderName: string | null;
  defaultSenderName: string;
  termsUrl: string | null;
  defaultTermsUrl: string;
}

/** The types that something sends today; the others have their texts and switch but wait for their trigger (segment E8) or their job. */
export const SENT_TYPES: readonly EmailType[] = ['welcome', 'arrived', 'approved', 'declined'];

/** An own text that is the default (the old form saved the defaults as if they were the editor's own) counts as following the default. */
const own = (text: string | null | undefined, standard: string): string | null => {
  const value = text?.trim();
  return value && value.replace(/\r\n?/g, '\n') !== standard.trim() ? value : null;
};

export async function loadEventEmails(db: Db, event: Document, sent: readonly EmailType[] = SENT_TYPES): Promise<EventEmailsView> {
  const loaded = await loadEventTexts(db, event);
  const { language, overrides } = loaded;
  const notifications = (event.notifications ?? {}) as Record<string, unknown>;
  const policy = normalizeSubmissionEmailPolicy(notifications, language, overrides);
  const defaults = emailDefaults(language, overrides);

  const types: EmailTypeView[] = EMAIL_TYPES.map((type) => {
    const standard = typeDefaults(type, language, overrides);
    const resolved = policy.types[type];
    // The approved e-mail is also the old "after save" pair, which `policy` already folds in.
    const subject = type === 'approved' ? policy.subjectTemplateAfterSave : resolved.subject;
    const body = type === 'approved' ? policy.bodyTemplateAfterSave : resolved.body;
    return {
      type,
      label: EMAIL_TYPE_INFO[type].label,
      when: EMAIL_TYPE_INFO[type].when,
      defaultOn: EMAIL_TYPE_INFO[type].defaultOn,
      enabled: resolved.enabled,
      chosen: resolved.chosen,
      subject: own(subject, standard.subject),
      body: own(body, standard.body),
      defaultSubject: standard.subject,
      defaultBody: standard.body,
      buttonLabel: standard.button,
      sent: sent.includes(type),
    };
  });

  const tryOnEnabled = Boolean((event.tryOn as { enabled?: unknown } | undefined)?.enabled);
  return {
    language,
    eventName: String(event.name ?? ''),
    types,
    tryOn: tryOnEnabled
      ? {
          related: { enabled: policy.sendAfterRelatedPhotosReady, subject: own(policy.subjectTemplateAfterRelatedPhotosReady, defaults.subject), body: own(policy.bodyTemplateAfterRelatedPhotosReady, defaults.body), defaultSubject: defaults.subject, defaultBody: defaults.body },
          resubmission: {
            enabled: policy.sendAfterTryOnResubmissionApproved,
            subject: own(policy.subjectTemplateAfterTryOnResubmissionApproved, defaults.resubmissionSubject),
            body: own(policy.bodyTemplateAfterTryOnResubmissionApproved, defaults.resubmissionBody),
            defaultSubject: defaults.resubmissionSubject,
            defaultBody: defaults.resubmissionBody,
          },
        }
      : null,
    senderName: typeof notifications.submissionResultEmailSenderName === 'string' && notifications.submissionResultEmailSenderName.trim() ? notifications.submissionResultEmailSenderName.trim() : null,
    defaultSenderName: DEFAULT_SUBMISSION_EMAIL_SENDER_NAME,
    termsUrl: typeof notifications.termsUrl === 'string' && notifications.termsUrl.trim() && emailTemplateIn(language, notifications.termsUrl, overrides) ? notifications.termsUrl.trim() : null,
    defaultTermsUrl: defaults.termsUrl || DEFAULT_EVENT_TERMS_URL,
  };
}
