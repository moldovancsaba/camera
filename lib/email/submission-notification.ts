import { sanitizeEmail } from '@/lib/security/sanitize';
import { renderThemedEmail } from '@/lib/email/themed-html';
import type { EventTheme } from '@/lib/theme/event-theme';
import { getResendApiKey, sendEmail } from '@/lib/email/send';
import {
  DEFAULT_SUBMISSION_EMAIL_SENDER_NAME,
  emailDefaults,
} from '@/lib/email/submission-template-defaults';
import { translate, type UiLanguage } from '@/lib/i18n';

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
  /** The language of the event (camera#352): the default texts and the words used when the name or the event is missing. English when absent. */
  language?: UiLanguage;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function renderTemplate(
  template: string,
  values: { recipientName: string; eventName: string; shareUrl: string; termsUrl: string }
): string {
  return template
    .replace(/\{name\}/gi, values.recipientName)
    .replace(/\{event\}/gi, values.eventName)
    .replace(/\{link\}/gi, values.shareUrl)
    .replace(/\{terms\}/gi, values.termsUrl);
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

  const language = input.language ?? 'en';
  const defaults = emailDefaults(language);
  const eventName = input.eventName?.trim() || translate(language, 'email.eventFallback');
  // The recipient resolver says "there" when the user gave no name; in another language that becomes the language's own word.
  const givenName = input.recipientName?.trim();
  const recipientName = givenName && givenName !== 'there' ? givenName : translate(language, 'email.nameFallback');
  const termsUrl = input.termsUrl?.trim() || defaults.termsUrl;
  const subject = renderTemplate(
    normalizeTemplate(input.subjectTemplate, defaults.subject, 180),
    { recipientName, eventName, shareUrl: input.shareUrl, termsUrl }
  )
    .replace(/\s+/g, ' ')
    .trim();
  const bodyText = renderTemplate(
    normalizeTemplate(input.bodyTemplate, defaults.body, 5000),
    { recipientName, eventName, shareUrl: input.shareUrl, termsUrl }
  );
  const safeBody = escapeHtml(bodyText).replace(/\n/g, '<br />');

  const result = await sendEmail({
    from,
    to: recipientEmail,
    subject,
    text: bodyText,
    html: input.theme
      ? renderThemedEmail({ theme: input.theme, eventName, bodyText, button: { label: input.buttonLabel?.trim() || translate(language, 'email.buttonOpen'), url: input.shareUrl } })
      : `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <p>${safeBody}</p>
      </div>
    `,
  });

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
