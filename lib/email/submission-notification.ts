import { Resend } from 'resend';
import { sanitizeEmail } from '@/lib/security/sanitize';
import {
  DEFAULT_SUBMISSION_EMAIL_BODY,
  DEFAULT_SUBMISSION_EMAIL_SUBJECT,
} from '@/lib/email/submission-template-defaults';

export interface SubmissionNotificationInput {
  recipientEmail?: string | null;
  recipientName?: string | null;
  eventName?: string | null;
  shareUrl: string;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
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
      reason: 'event_email_disabled' | 'missing_recipient' | 'missing_api_key';
    }
  | {
      sent: false;
      skipped: false;
      provider: 'resend';
      recipientEmail: string;
      error: string;
    };

function getEmailApiKey(): string {
  return (process.env.RESEND_API_KEY || process.env.RESEND || process.env.EMAIL_API_KEY || '').trim();
}

function getEmailFrom(): string {
  return (
    process.env.CAMERA_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    'Camera <onboarding@resend.dev>'
  ).trim();
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
  values: { recipientName: string; eventName: string; shareUrl: string }
): string {
  return template
    .replace(/\{name\}/gi, values.recipientName)
    .replace(/\{event\}/gi, values.eventName)
    .replace(/\{link\}/gi, values.shareUrl);
}

export async function sendSubmissionResultEmail(
  input: SubmissionNotificationInput
): Promise<SubmissionNotificationResult> {
  const recipientEmail = normalizeRecipient(input.recipientEmail);
  if (!recipientEmail) {
    return { sent: false, skipped: true, reason: 'missing_recipient' };
  }

  const apiKey = getEmailApiKey();
  if (!apiKey) {
    return { sent: false, skipped: true, reason: 'missing_api_key' };
  }

  const eventName = input.eventName?.trim() || 'your event';
  const recipientName = input.recipientName?.trim() || 'there';
  const subject = renderTemplate(
    normalizeTemplate(input.subjectTemplate, DEFAULT_SUBMISSION_EMAIL_SUBJECT, 180),
    { recipientName, eventName, shareUrl: input.shareUrl }
  )
    .replace(/\s+/g, ' ')
    .trim();
  const bodyText = renderTemplate(
    normalizeTemplate(input.bodyTemplate, DEFAULT_SUBMISSION_EMAIL_BODY, 5000),
    { recipientName, eventName, shareUrl: input.shareUrl }
  );
  const safeBody = escapeHtml(bodyText).replace(/\n/g, '<br />');
  const safeShareUrl = escapeHtml(input.shareUrl);

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: getEmailFrom(),
      to: recipientEmail,
      subject,
      text: bodyText,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <p>${safeBody}</p>
          <p>
            <a href="${safeShareUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 8px; text-decoration: none;">
              View your photo
            </a>
          </p>
          <p>If the button does not work, open this link:</p>
          <p><a href="${safeShareUrl}">${safeShareUrl}</a></p>
        </div>
      `,
    });

    if (response.error) {
      return {
        sent: false,
        skipped: false,
        provider: 'resend',
        recipientEmail,
        error: response.error.message || 'Resend rejected the email',
      };
    }

    return {
      sent: true,
      provider: 'resend',
      messageId: response.data?.id ?? null,
      recipientEmail,
    };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      provider: 'resend',
      recipientEmail,
      error: error instanceof Error ? error.message : 'Unknown email delivery error',
    };
  }
}
