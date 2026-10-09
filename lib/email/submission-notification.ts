import { sanitizeEmail } from '@/lib/security/sanitize';
import { composeEmail } from '@/lib/email/compose';
import { emailValues, type EventFacts } from '@/lib/email/variables';
import type { EventTheme } from '@/lib/theme/event-theme';
import { getResendApiKey, sendEmail } from '@/lib/email/send';
import {
  DEFAULT_SUBMISSION_EMAIL_SENDER_NAME,
  emailDefaults,
} from '@/lib/email/submission-template-defaults';
import { DEFAULT_UI_LANGUAGE, translate, type UiLanguage } from '@/lib/i18n';
import type { TextOverrides } from '@/lib/i18n/overrides';

export interface SubmissionNotificationInput {
  recipientEmail?: string | null;
  recipientName?: string | null;
  eventName?: string | null;
  shareUrl: string;
  termsUrl?: string | null;
  senderName?: string | null;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
  /** The look of the event (camera#285): the email is drawn in its colours with its logo and a button; absent, the plain layout is used. */
  theme?: EventTheme | null;
  /** The label of the button that opens `shareUrl` in a themed email. */
  buttonLabel?: string | null;
  /** An e-mail with nothing to link to yet (arrived): no button. */
  noButton?: boolean;
  /** The language of the event (camera#352): the default texts and the words used when the name or the event is missing. English when absent. */
  language?: UiLanguage;
  /** The wordings written for the event's partner or the event in that language (lib/i18n/overrides.ts): used instead of the dictionary text. */
  texts?: TextOverrides | null;
  /** What is known about the event and its partner (the teams, the date, the place...), for the variables of the text (lib/email/variables.ts, epic 463). */
  facts?: EventFacts | null;
  /** The legal part that applies to the event in its language (lib/email/legal.ts), as the editor wrote it; null when no level has one. It is shown as small print under the message and the button. */
  legal?: string | null;
}

export type SubmissionNotificationResult =
  | {
      sent: true;
      provider: 'resend';
      messageId: string | null;
      recipientEmail: string;
    }
  | {
      sent: false;
      skipped: true;
      reason: 'event_email_disabled' | 'missing_recipient' | 'missing_api_key' | 'missing_from_address';
    }
  | {
      sent: false;
      skipped: false;
      provider: 'resend';
      recipientEmail: string;
      error: string;
    };

function getEmailFrom(senderName?: string | null): string {
  const configuredFrom = (process.env.CAMERA_EMAIL_FROM || '').trim();
  if (!configuredFrom) {
    return '';
  }

  const resolvedSenderName =
    (typeof senderName === 'string' && senderName.trim()) ||
    DEFAULT_SUBMISSION_EMAIL_SENDER_NAME;
  const escapedName = resolvedSenderName.replace(/["\\]/g, (char) => `\\${char}`);

  if (configuredFrom.includes('<') && configuredFrom.includes('>')) {
    const match = configuredFrom.match(/<\s*([^>]+)\s*>/);
    if (match && match[1]) {
      return `"${escapedName}" <${match[1].trim()}>`;
    }
  }

  return `"${escapedName}" <${configuredFrom}>`;
}

function normalizeRecipient(value?: string | null): string {
  const email = sanitizeEmail(value || '');
  if (!email || email === 'anonymous@event' || email === 'anonymous@event.com') {
    return '';
  }
  return email;
}

function normalizeTemplate(value: string | null | undefined, fallback: string, maxLength: number): string {
  const normalized = value?.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) {
    return fallback;
  }
  return normalized.slice(0, maxLength);
}

export async function sendSubmissionResultEmail(
  input: SubmissionNotificationInput
): Promise<SubmissionNotificationResult> {
  const recipientEmail = normalizeRecipient(input.recipientEmail);
  if (!recipientEmail) {
    console.warn('[email] Submission result email skipped: missing recipient', {
      eventName: input.eventName || null,
    });
    return { sent: false, skipped: true, reason: 'missing_recipient' };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[email] Submission result email skipped: RESEND API key missing', {
      eventName: input.eventName || null,
      hasResendKey: Boolean(process.env.RESEND_API_KEY || process.env.RESEND || process.env.EMAIL_API_KEY),
    });
    return { sent: false, skipped: true, reason: 'missing_api_key' };
  }

  const from = getEmailFrom(input.senderName);
  if (!from) {
    console.error('[email] Submission result email skipped: missing configured sender address', {
      eventName: input.eventName || null,
      hasCameraEmailFrom: Boolean(process.env.CAMERA_EMAIL_FROM),
      nodeEnv: process.env.NODE_ENV || 'unknown',
    });
    return { sent: false, skipped: true, reason: 'missing_from_address' };
  }

  const language = input.language ?? DEFAULT_UI_LANGUAGE;
  const defaults = emailDefaults(language, input.texts);
  const eventName = input.eventName?.trim() || translate(language, 'email.eventFallback', undefined, input.texts);
  // The recipient resolver says "there" when the user gave no name; in another language that becomes the language's own word.
  const givenName = input.recipientName?.trim();
  const recipientName = givenName && givenName !== translate(DEFAULT_UI_LANGUAGE, 'email.nameFallback') ? givenName : translate(language, 'email.nameFallback', undefined, input.texts);
  const termsUrl = input.termsUrl?.trim() || defaults.termsUrl;
  // The variables are filled after the text is read (lib/email/rich.ts), so a value, a name a user typed, is never markup. One that has no value for this event is left out and logged.
  const values = emailValues({ recipientName, eventName, shareUrl: input.shareUrl, termsUrl, facts: input.facts, language });
  const composed = composeEmail({
    subjectTemplate: normalizeTemplate(input.subjectTemplate, defaults.subject, 180),
    bodyTemplate: normalizeTemplate(input.bodyTemplate, defaults.body, 5000),
    legal: input.legal,
    values,
    theme: input.theme ?? null,
    eventName,
    button: input.noButton ? null : { label: input.buttonLabel?.trim() || translate(language, 'email.buttonOpen'), url: input.shareUrl },
  });
  if (composed.warnings.withoutValue.length > 0 || composed.warnings.unknown.length > 0) {
    console.warn('[email] Submission result email: variables left out', { eventName: input.eventName || null, withoutValue: composed.warnings.withoutValue, unknown: composed.warnings.unknown });
  }

  const result = await sendEmail({ from, to: recipientEmail, subject: composed.subject, text: composed.text, html: composed.html });

  if (!result.sent) {
    console.error('[email] Submission result email failed', {
      eventName: input.eventName || null,
      recipientEmail,
      from,
      error: result.error,
    });
    return {
      sent: false,
      skipped: false,
      provider: 'resend',
      recipientEmail,
      error: result.error,
    };
  }

  console.info('[email] Submission result email queued successfully', {
    eventName: input.eventName || null,
    recipientEmail,
    messageId: result.messageId,
  });

  return {
    sent: true,
    provider: 'resend',
    messageId: result.messageId,
    recipientEmail,
  };
}
