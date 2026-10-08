import { DEFAULT_UI_LANGUAGE, translate, type MessageKey, type UiLanguage } from '@/lib/i18n';

/**
 * The default wording of the emails to the user, in the language of the event (camera#352). The English constants are the dictionary's English texts,
 * for code that has no language (the admin forms, the preview); the sender uses `emailDefaults(language)`.
 */
export function emailDefaults(language: UiLanguage = DEFAULT_UI_LANGUAGE) {
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

const ENGLISH = emailDefaults(DEFAULT_UI_LANGUAGE);

export const DEFAULT_SUBMISSION_EMAIL_SUBJECT = ENGLISH.subject;
export const DEFAULT_SUBMISSION_EMAIL_SENDER_NAME = 'The Selfie';

export const DEFAULT_EVENT_TERMS_URL = ENGLISH.termsUrl;

export const DEFAULT_SUBMISSION_EMAIL_BODY = ENGLISH.body;

export const DEFAULT_TRYON_RESUBMISSION_EMAIL_SUBJECT = ENGLISH.resubmissionSubject;

export const DEFAULT_TRYON_RESUBMISSION_EMAIL_BODY = ENGLISH.resubmissionBody;

export const SUBMISSION_EMAIL_TEMPLATE_HELP =
  'Available placeholders: {name}, {event}, {link}, {terms}. Email body is sent as plain text.';

const normalizeNewlines = (value: string) => value.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

/** The defaults the event editor pre-fills in its email fields, so an event may hold them as if they were the editor's own. */
const PREFILLED_DEFAULT_KEYS = ['email.subject', 'email.body', 'email.subjectResubmission', 'email.bodyResubmission'] as const satisfies readonly MessageKey[];

/**
 * A template an editor may have stored, as it is sent in the language. The event editor pre-fills and saves the English defaults as if they were the
 * editor's own, so in another language a stored template that is exactly one of the English defaults counts as not set: the same default in the
 * language is sent instead (an updated-photo text stays the updated-photo text). An editor's own text is sent as written; in English nothing changes.
 */
export function emailTemplateIn(language: UiLanguage, stored: string | null): string | null {
  if (!stored) return null;
  if (language === DEFAULT_UI_LANGUAGE) return stored;
  const key = PREFILLED_DEFAULT_KEYS.find((candidate) => normalizeNewlines(translate(DEFAULT_UI_LANGUAGE, candidate)) === normalizeNewlines(stored));
  return key ? translate(language, key) : stored;
}
