/**
 * The two emails of a vetted photo (camera#267, docs/PHOTO_VETTING_PLAN.md): the link once the photo is approved, and a short fixed
 * "not approved" note with a link to take another photo. They go to the email the guest gave (typed or from the login) and are sent for
 * every vetted event, whatever the event's own notification switch says: the approval email is how the guest gets the share link.
 */

import type { Event } from '@/lib/db/schemas';
import { sendSubmissionResultEmail, type SubmissionNotificationInput, type SubmissionNotificationResult } from '@/lib/email/submission-notification';
import { normalizeSubmissionEmailPolicy, resolveSubmissionResultEmailRecipient, buildSubmissionShareUrl } from '@/lib/email/submission-result-email';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import type { EventTheme } from '@/lib/theme/event-theme';

type EmailSender = (input: SubmissionNotificationInput) => Promise<SubmissionNotificationResult>;
type RecipientSource = Parameters<typeof resolveSubmissionResultEmailRecipient>[0];
type EventForEmail = Pick<Event, 'name' | 'notifications'> | null;

export const NOT_APPROVED_SUBJECT = 'About your photo from {event}';
export const NOT_APPROVED_BODY = `Hi {name},

Thank you for taking part in {event}. Unfortunately your photo could not be approved, so it will not be published.

You are welcome to take another photo:
{link}

Policies and General Terms and Conditions:
{terms}`;

/** The share link is the opaque token of the photo, never its database id. */
export function approvedShareUrl(shareToken: string, baseUrl: string = getConfiguredSiteUrl()): string {
  return buildSubmissionShareUrl(shareToken, baseUrl);
}

export function takeAnotherPhotoUrl(eventKey: string, baseUrl: string = getConfiguredSiteUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}/capture/${encodeURIComponent(eventKey)}`;
}

/** "Your photo is ready": the event's own after-save wording when it has one, the standard text otherwise. */
export async function sendPhotoApprovedEmail(
  submission: RecipientSource,
  event: EventForEmail,
  shareUrl: string,
  send: EmailSender = sendSubmissionResultEmail,
  theme: EventTheme | null = null
): Promise<SubmissionNotificationResult> {
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications);
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
    buttonLabel: 'See your photo',
  });
}

/** "Not approved": fixed wording, so a typed address that is not the guest's own only ever receives a harmless note. */
export async function sendPhotoNotApprovedEmail(
  submission: RecipientSource,
  event: EventForEmail,
  captureUrl: string,
  send: EmailSender = sendSubmissionResultEmail,
  theme: EventTheme | null = null
): Promise<SubmissionNotificationResult> {
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications);
  return send({
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    eventName: event?.name ?? null,
    shareUrl: captureUrl,
    termsUrl: policy.termsUrl,
    senderName: policy.senderName,
    subjectTemplate: NOT_APPROVED_SUBJECT,
    bodyTemplate: NOT_APPROVED_BODY,
    theme,
    buttonLabel: 'Take another photo',
  });
}
