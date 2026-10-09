/**
 * The two emails of a vetted photo (camera#267, docs/PHOTO_VETTING_PLAN.md): the link once the photo is approved, and a short fixed
 * "not approved" note with a link to take another photo. They go to the email the guest gave (typed or from the login) and are sent for
 * every vetted event, whatever the event's own notification switch says: the approval email is how the guest gets the share link.
 */

import type { Event } from '@/lib/db/schemas';
import { captureLinkOf, emailFactsOf, shortLinkOf } from '@/lib/email/event-link';
import { emailDefaults } from '@/lib/email/submission-template-defaults';
import { normalizeUiLanguage, translate } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';
import { sendSubmissionResultEmail, type SubmissionNotificationInput, type SubmissionNotificationResult } from '@/lib/email/submission-notification';
import { normalizeSubmissionEmailPolicy, resolveSubmissionResultEmailRecipient, buildSubmissionShareUrl } from '@/lib/email/submission-result-email';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import type { EventTheme } from '@/lib/theme/event-theme';

type EmailSender = (input: SubmissionNotificationInput) => Promise<SubmissionNotificationResult>;
type RecipientSource = Parameters<typeof resolveSubmissionResultEmailRecipient>[0];
type EventForEmail = Pick<Event, 'name' | 'notifications' | 'uiLanguage'> | null;

/** The English texts of the not-approved email (the dictionary's), for code that has no language. */
export const NOT_APPROVED_SUBJECT = emailDefaults().notApprovedSubject;
export const NOT_APPROVED_BODY = emailDefaults().notApprovedBody;

/** The share link is the opaque token of the photo, never its database id. */
export function approvedShareUrl(shareToken: string, baseUrl: string = getConfiguredSiteUrl()): string {
  return buildSubmissionShareUrl(shareToken, baseUrl);
}

export function takeAnotherPhotoUrl(eventKey: string, baseUrl: string = getConfiguredSiteUrl(), event?: { shortUrlSlug?: unknown } | null): string {
  // The event's own short link when the editor set a URL slug (owner, 2026-10-09), else its capture page.
  return shortLinkOf(event) ?? captureLinkOf(eventKey, baseUrl);
}

/** "Your photo is ready": the event's own after-save wording when it has one, the standard text in the event's language otherwise. */
export async function sendPhotoApprovedEmail(
  submission: RecipientSource,
  event: EventForEmail,
  shareUrl: string,
  send: EmailSender = sendSubmissionResultEmail,
  theme: EventTheme | null = null,
  texts: TextOverrides | null = null
): Promise<SubmissionNotificationResult> {
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  const language = normalizeUiLanguage(event?.uiLanguage);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications, language, texts);
  return send({
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    eventName: event?.name ?? null,
    shareUrl,
    termsUrl: policy.termsUrl,
    senderName: policy.senderName,
    subjectTemplate: policy.subjectTemplateAfterSave || policy.subjectTemplate,
    bodyTemplate: policy.bodyTemplateAfterSave || policy.bodyTemplate,
    theme,
    buttonLabel: translate(language, 'email.buttonSee', undefined, texts),
    language,
    texts,
    facts: emailFactsOf(event),
  });
}

/** "Not approved": fixed wording in the event's language, so a typed address that is not the guest's own only ever receives a harmless note. */
export async function sendPhotoNotApprovedEmail(
  submission: RecipientSource,
  event: EventForEmail,
  captureUrl: string,
  send: EmailSender = sendSubmissionResultEmail,
  theme: EventTheme | null = null,
  texts: TextOverrides | null = null
): Promise<SubmissionNotificationResult> {
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  const language = normalizeUiLanguage(event?.uiLanguage);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications, language, texts);
  const defaults = emailDefaults(language, texts);
  return send({
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    eventName: event?.name ?? null,
    shareUrl: captureUrl,
    termsUrl: policy.termsUrl,
    senderName: policy.senderName,
    subjectTemplate: defaults.notApprovedSubject,
    bodyTemplate: defaults.notApprovedBody,
    theme,
    buttonLabel: translate(language, 'email.buttonAnother', undefined, texts),
    language,
    texts,
    facts: emailFactsOf(event),
  });
}
