import { translate, type UiLanguage } from '@/lib/i18n';

/**
 * The default wording of the emails to the user, in the language of the event (camera#352). The English constants are the dictionary's English texts,
 * for code that has no language (the admin forms, the preview); the sender uses `emailDefaults(language)`.
 */
export function emailDefaults(language: UiLanguage = 'en') {
  return {
    subject: translate(language, 'email.subject'),
    body: translate(language, 'email.body'),
    resubmissionSubject: translate(language, 'email.subjectResubmission'),
    resubmissionBody: translate(language, 'email.bodyResubmission'),
    notApprovedSubject: translate(language, 'email.notApprovedSubject'),
    notApprovedBody: translate(language, 'email.notApprovedBody'),
    termsUrl: translate(language, 'email.termsUrl'),
  };
}

const ENGLISH = emailDefaults('en');

export const DEFAULT_SUBMISSION_EMAIL_SUBJECT = ENGLISH.subject;
export const DEFAULT_SUBMISSION_EMAIL_SENDER_NAME = 'The Selfie';

export const DEFAULT_EVENT_TERMS_URL = ENGLISH.termsUrl;

export const DEFAULT_SUBMISSION_EMAIL_BODY = ENGLISH.body;

export const DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT = ENGLISH.resubmissionSubject;

export const DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY = ENGLISH.resubmissionBody;

export const SUBMISSION_EMAIL_TEMPLATE_HELP =
  'Available placeholders: {name}, {event}, {link}, {terms}. Email body is sent as plain text.';

const normalizeNewlines = (value: string) => value.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

/**
 * A template an editor may have stored: the editor's own text, or null when it is empty or exactly one of the English defaults. The event editor
 * pre-fills and saves the English defaults as if they were the editor's own, so in another language such a stored template counts as not set and the
 * language's own default is sent; in English nothing changes.
 */
export function ownEmailTemplate(language: UiLanguage, stored: string | null): string | null {
  if (!stored) return null;
  if (language === 'en') return stored;
  const english = [ENGLISH.subject, ENGLISH.body, ENGLISH.resubmissionSubject, ENGLISH.resubmissionBody, ENGLISH.notApprovedSubject, ENGLISH.notApprovedBody];
  return english.some((text) => normalizeNewlines(text) === normalizeNewlines(stored)) ? null : stored;
}
