import { ObjectId, type Db, type WithId } from 'mongodb';
import { COLLECTIONS, type Event, type Submission } from '@/lib/db/schemas';
import { sendSubmissionResultEmail, type SubmissionNotificationResult, type SubmissionNotificationInput } from '@/lib/email/submission-notification';
import { sanitizeEmail } from '@/lib/security/sanitize';
import { loadEventTheme } from '@/lib/theme/load';
import { emailFactsOf } from '@/lib/email/event-link';
import { loadEventLegal } from '@/lib/email/legal';
import { EMAIL_TYPES, parseTypeSettings, switchIsOn, type EmailType, type ResolvedType, type SwitchDefaults } from '@/lib/email/types';
import type { EventFacts } from '@/lib/email/variables';
import type { EventTheme } from '@/lib/theme/event-theme';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import {
  DEFAULT_EVENT_TERMS_URL,
  DEFAULT_SUBMISSION_EMAIL_SENDER_NAME,
  emailDefaults,
  emailTemplateIn,
} from '@/lib/email/submission-template-defaults';
import { DEFAULT_UI_LANGUAGE, normalizeUiLanguage, translate, type UiLanguage } from '@/lib/i18n';
import { loadEventTexts, withEffectiveLanguage, type TextOverrides } from '@/lib/i18n/overrides';

export interface SubmissionEmailPolicy {
  enabled: boolean;
  sendAfterSave: boolean;
  senderName: string;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
  subjectTemplateAfterSave?: string | null;
  bodyTemplateAfterSave?: string | null;
  termsUrl: string;
  /** The five e-mails a user can get (lib/email/types.ts): whether each is on, and the event's own subject and message when it has them. */
  types: Record<EmailType, ResolvedType>;
  /** The language of the event: the defaults the email falls back to, and the words around the name and the event (camera#352). */
  language: UiLanguage;
  /** The wordings written for the event's partner or the event in that language (issue 353); absent: the dictionary. */
  texts?: TextOverrides | null;
}

export interface SubmissionEmailRecipient {
  email: string | null;
  name: string | null;
}

const PUBLIC_BASE_URL = getConfiguredSiteUrl();

function hasOwnProperty(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTemplate(value: unknown, maxLength: number, normalizeNewlines = false): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const normalized = normalizeNewlines
    ? trimmed.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    : trimmed;
  return normalized.slice(0, maxLength);
}

function readSenderName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SUBMISSION_EMAIL_SENDER_NAME;
}

export function resolveSubmissionResultEmailRecipient(submission: {
  userInfo?: { name?: string; email?: string } | null;
  userEmail?: string;
  userName?: string | null;
}): SubmissionEmailRecipient {
  // "there" when no name is known: the sender puts the word of the event's language in its place (camera#352).
  const name = readString(submission.userInfo?.name) || readString(submission.userName) || translate(DEFAULT_UI_LANGUAGE, 'email.nameFallback');
  const candidateEmail =
    readString(submission.userInfo?.email) ||
    (submission.userEmail && submission.userEmail !== 'anonymous@event' ? submission.userEmail : null);

  return {
    name,
    email: sanitizeEmail(candidateEmail || ''),
  };
}

/**
 * The email settings of an event. With a language (camera#352) the templates are the ones sent in it: a stored English default becomes the same
 * default in the language, and so does the stored English terms link; without one (the event API, which stores what it reads) nothing changes.
 * With the partner's switch defaults (`partnerSwitchDefaults`) an e-mail type the event never chose follows its partner.
 */
export function normalizeSubmissionEmailPolicy(value: unknown, language: UiLanguage = DEFAULT_UI_LANGUAGE, texts?: TextOverrides | null, partnerDefaults?: SwitchDefaults | null): SubmissionEmailPolicy {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const typeSettings = parseTypeSettings(source.types);

  const hasExplicitAfterSave = hasOwnProperty(source, 'submissionResultEmailSendAfterSave');
  // The old master switch, when an editor stored it as off, still turns the old switches off. An event that stored nothing follows the defaults of the five types (owner, 2026-10-09):
  // approved is on, so an event that never chose sends it (answer 204).
  const masterOff = hasOwnProperty(source, 'submissionResultEmailEnabled') && !source.submissionResultEmailEnabled;
  const legacyApproved = masterOff ? false : hasExplicitAfterSave ? Boolean(source.submissionResultEmailSendAfterSave) : true;
  const sendAfterSave = typeSettings.approved?.enabled ?? legacyApproved;
  // The e-mail is on when the approved e-mail is. (It was also on while one of the two older try-on e-mails, "related photos" and "resubmission
  // approved", was; they are gone, issue 557.)
  const enabled = sendAfterSave;

  // In another language a stored English default is read as the same default in that language (emailTemplateIn).
  const own = (template: string) => emailTemplateIn(language, template || null, texts) ?? '';
  const legacySubject = own(readTemplate(source.submissionResultEmailSubject, 180));
  const legacyBody = own(readTemplate(source.submissionResultEmailBody, 5000, true));
  // The approved type's own subject and message are the "after save" pair (one e-mail, two ways it is reached).
  const subjectTemplateAfterSave = typeSettings.approved?.subject ?? (own(readTemplate(
    source.submissionResultEmailSubjectAfterSave,
    180
  )) || legacySubject);
  const bodyTemplateAfterSave =
    typeSettings.approved?.body ?? (own(readTemplate(source.submissionResultEmailBodyAfterSave, 5000, true)) || legacyBody);
  // The event editor saves the English terms link when the field is left as it is: in another language that link counts as not set, and the legal page
  // of the language is linked.
  const storedTermsUrl = readString(source.termsUrl);
  const termsUrl =
    storedTermsUrl && (language === DEFAULT_UI_LANGUAGE || storedTermsUrl !== DEFAULT_EVENT_TERMS_URL)
      ? storedTermsUrl
      : emailDefaults(language, texts).termsUrl;

  const types = Object.fromEntries(
    EMAIL_TYPES.map((type) => {
      const stored = typeSettings[type];
      const chosen = stored?.enabled ?? null;
      const resolved: ResolvedType = {
        // The event's own choice, else its partner's default (only the follow up has one), else the standard of the type.
        enabled: type === 'approved' ? sendAfterSave : switchIsOn(type, chosen, partnerDefaults),
        chosen,
        subject: stored?.subject ?? null,
        body: stored?.body ?? null,
      };
      return [type, resolved];
    })
  ) as Record<EmailType, ResolvedType>;

  return {
    enabled,
    sendAfterSave,
    types,
    subjectTemplate: legacySubject || null,
    bodyTemplate: legacyBody || null,
    senderName: readSenderName(source.submissionResultEmailSenderName),
    subjectTemplateAfterSave,
    bodyTemplateAfterSave,
    termsUrl,
    language,
    texts: texts ?? null,
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

  const event = await db.collection<Event>(COLLECTIONS.EVENTS).findOne({ $or: orClauses });
  // An event that did not set a language follows its partner's (issue 353): the e-mails read `uiLanguage` from this document.
  return event ? withEffectiveLanguage(db, event) : null;
}

export interface SendSubmissionEmailMetadataResult {
  sent: boolean;
  shouldRetry: boolean;
  metadataPatch: Record<string, unknown>;
}

function buildModePatch(): Record<string, unknown> {
  return {
    'metadata.emailSentAfterSave': true,
  };
}

function buildFailureModePatch(): Record<string, unknown> {
  return {
    'metadata.emailSentAfterSave': false,
  };
}

export function buildEmailMetadataPatch(
  result: SubmissionNotificationResult,
  shareUrl: string
): SendSubmissionEmailMetadataResult {
  const now = new Date().toISOString();

  if (result.sent) {
    return {
      sent: true,
      shouldRetry: false,
      metadataPatch: {
        ...buildModePatch(),
        'metadata.emailSent': true,
        'metadata.emailSentAt': now,
        'metadata.emailRecipient': result.recipientEmail,
        'metadata.emailProvider': result.provider,
        'metadata.emailMessageId': result.messageId ?? null,
        'metadata.emailSkipReason': null,
        'metadata.emailError': null,
        'metadata.emailSkippedAt': null,
        'metadata.emailFailedAt': null,
        'metadata.shareUrl': shareUrl,
      },
    };
  }

  if (result.sent === false && result.skipped) {
    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        ...buildModePatch(),
        ...buildFailureModePatch(),
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
      ...buildModePatch(),
      ...buildFailureModePatch(),
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
  eventName: string | null,
  theme: EventTheme | null = null,
  facts: EventFacts | null = null,
  legal: string | null = null
): SubmissionNotificationInput | null {
  const recipient = resolveSubmissionResultEmailRecipient(submission);
  if (!recipient.email) {
    return null;
  }

  const subjectTemplate = policy.subjectTemplateAfterSave || policy.subjectTemplate;
  const bodyTemplate = policy.bodyTemplateAfterSave || policy.bodyTemplate;

  return {
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    eventName,
    shareUrl,
    termsUrl: policy.termsUrl,
    senderName: policy.senderName,
    subjectTemplate,
    bodyTemplate,
    theme,
    language: policy.language,
    texts: policy.texts,
    facts,
    legal,
  };
}

export async function sendSubmissionResultEmailByPolicy(
  submission: Parameters<typeof buildSubmissionEmailInput>[0],
  eventName: string | null,
  shareUrl: string,
  policy: SubmissionEmailPolicy,
  theme: EventTheme | null = null,
  facts: EventFacts | null = null,
  legal: string | null = null
): Promise<SendSubmissionEmailMetadataResult> {
  const input = buildSubmissionEmailInput(submission, shareUrl, policy, eventName, theme, facts, legal);
  if (!input) {
    const now = new Date().toISOString();

    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {
        ...buildFailureModePatch(),
        'metadata.emailSent': false,
        'metadata.emailSkippedAt': now,
        'metadata.emailSkipReason': 'missing_recipient',
        'metadata.shareUrl': shareUrl,
      },
    };
  }

  return buildEmailMetadataPatch(await sendSubmissionResultEmail(input), shareUrl);
}

/** The wordings written for the event's partner or the event, for its e-mails (issue 353); none when there is no event or the read fails. */
export async function textsOf(db: Db, event: WithId<Event> | null): Promise<TextOverrides | null> {
  if (!event) return null;
  return (await loadEventTexts(db, event).catch(() => null))?.overrides ?? null;
}

/** The legal part that applies to the event in its language (epic 463): the event's own, its partner's, or the general one; null when no level has one, or the read fails. */
export async function legalOf(db: Db, event: WithId<Event> | null): Promise<string | null> {
  if (!event) return null;
  return (await loadEventLegal(db, event).catch(() => null))?.effective?.text ?? null;
}

/** The theme of the event for its guest emails; null when it cannot be loaded, and the email then keeps its plain layout. */
export async function themeOf(db: Db, event: WithId<Event> | null): Promise<EventTheme | null> {
  if (!event) return null;
  try {
    return await loadEventTheme(db, event);
  } catch {
    return null;
  }
}

export async function dispatchPendingSubmissionEmailForSubmission(
  db: Db,
  sourceSubmission: WithId<Submission>,
  baseUrl = PUBLIC_BASE_URL
): Promise<SendSubmissionEmailMetadataResult | null> {
  // A photo that is waiting for a decision, or was not approved, gets no link by this path: the guest of a vetted photo is
  // emailed when it is approved (lib/photo-vetting/review.ts), and the share link of a pending photo shows nothing.
  if (sourceSubmission.reviewStatus === 'pending_review' || sourceSubmission.reviewStatus === 'rejected') {
    return null;
  }

  const event = await resolveEventForSubmission(db, sourceSubmission);
  const policy = normalizeSubmissionEmailPolicy(event?.notifications, normalizeUiLanguage(event?.uiLanguage), await textsOf(db, event));

  if (!policy.enabled) {
    return null;
  }

  if (sourceSubmission.metadata?.emailSent) {
    return {
      sent: false,
      shouldRetry: false,
      metadataPatch: {},
    };
  }

  if (!policy.sendAfterSave || sourceSubmission.metadata?.emailSentAfterSave === true) {
    return { sent: false, shouldRetry: false, metadataPatch: {} };
  }

  const submissionId = sourceSubmission._id.toString();
  const shareUrl = buildSubmissionShareUrl(submissionId, baseUrl);
  const afterSaveResult = await sendSubmissionResultEmailByPolicy(
    sourceSubmission,
    event?.name || null,
    shareUrl,
    policy,
    await themeOf(db, event),
    emailFactsOf(event),
    await legalOf(db, event)
  );

  // What the send answered: sent, skipped (no recipient, e-mail off, no key) or failed, and then to be retried.
  return afterSaveResult;
}
