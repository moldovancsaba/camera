/**
 * What the Emails page of an event shows (epic 463, docs/EMAIL_FORMAT_PLAN.md, segment E3): for each of the five types its switch (on or off, and whether the editor chose it or it follows
 * the default), the event's own subject and message (null when it follows the default), and the default subject and message in the event's language with the wordings written for its
 * partner and itself; and the sender and the terms link. Server side; unit-tested through the route.
 */

import type { Db, Document } from 'mongodb';
import { DEFAULT_SUBMISSION_EMAIL_SENDER_NAME, DEFAULT_EVENT_TERMS_URL, emailDefaults, emailTemplateIn } from '@/lib/email/submission-template-defaults';
import { normalizeSubmissionEmailPolicy } from '@/lib/email/submission-result-email';
import { FOLLOW_UP_MIN_AGE_DAYS, addDays, calendarDay, followUpMaxAgeDays } from '@/lib/email/follow-up-rules';
import { EMAIL_TYPES, EMAIL_TYPE_INFO, partnerSwitchDefaults, typeDefaults, type EmailType } from '@/lib/email/types';
import type { UiLanguage } from '@/lib/i18n';
import { loadEventTexts } from '@/lib/i18n/overrides';

export interface EmailTypeView {
  type: EmailType;
  label: string;
  when: string;
  defaultOn: boolean;
  /** Where `defaultOn` comes from: the standard of the type, or the partner's default for its events that made no choice (the follow up). */
  defaultFrom: 'standard' | 'partner';
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

/** When the follow-up e-mail of this event goes (from its date): empty when the event has no usable date, and then nothing is sent. */
export interface FollowUpWindow {
  /** The calendar day of the event, or null. */
  day: string | null;
  /** The first day it is sent and the last day it still is (a job that did not run catches up until then). */
  from: string | null;
  until: string | null;
}

export interface EventEmailsView {
  language: UiLanguage;
  eventName: string;
  types: EmailTypeView[];
  followUp: FollowUpWindow;
  senderName: string | null;
  defaultSenderName: string;
  termsUrl: string | null;
  defaultTermsUrl: string;
}

/** The types that something sends today: welcome and arrived by their triggers (segment E8), approved and declined by the photo review, the follow up by the daily job (issue 559). A type that nothing sends yet would be marked "not sent yet" on the page. */
export const SENT_TYPES: readonly EmailType[] = ['welcome', 'arrived', 'approved', 'declined', 'followUp'];

/** An own text that is the default (the old form saved the defaults as if they were the editor's own) counts as following the default. */
const own = (text: string | null | undefined, standard: string): string | null => {
  const value = text?.trim();
  return value && value.replace(/\r\n?/g, '\n') !== standard.trim() ? value : null;
};

export async function loadEventEmails(db: Db, event: Document, sent: readonly EmailType[] = SENT_TYPES): Promise<EventEmailsView> {
  const loaded = await loadEventTexts(db, event);
  const { language, overrides } = loaded;
  const notifications = (event.notifications ?? {}) as Record<string, unknown>;
  // The partner's default for the follow up applies to an event that never chose (the event's own choice, else its partner's, else off).
  const partnerDefaults = partnerSwitchDefaults(loaded.partner);
  const policy = normalizeSubmissionEmailPolicy(notifications, language, overrides, partnerDefaults);
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
      defaultOn: partnerDefaults[type] ?? EMAIL_TYPE_INFO[type].defaultOn,
      defaultFrom: partnerDefaults[type] === undefined ? 'standard' : 'partner',
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

  const day = calendarDay(event.eventDate);
  const followUp: FollowUpWindow = day ? { day, from: addDays(day, FOLLOW_UP_MIN_AGE_DAYS), until: addDays(day, followUpMaxAgeDays(process.env.FOLLOW_UP_MAX_AGE_DAYS)) } : { day: null, from: null, until: null };

  return {
    language,
    eventName: String(event.name ?? ''),
    types,
    followUp,
    senderName: typeof notifications.submissionResultEmailSenderName === 'string' && notifications.submissionResultEmailSenderName.trim() ? notifications.submissionResultEmailSenderName.trim() : null,
    defaultSenderName: DEFAULT_SUBMISSION_EMAIL_SENDER_NAME,
    termsUrl: typeof notifications.termsUrl === 'string' && notifications.termsUrl.trim() && emailTemplateIn(language, notifications.termsUrl, overrides) ? notifications.termsUrl.trim() : null,
    defaultTermsUrl: defaults.termsUrl || DEFAULT_EVENT_TERMS_URL,
  };
}
