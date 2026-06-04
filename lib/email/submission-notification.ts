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
      reason: 'event_email_disabled' | 'missing_recipient' | 'missing_api_key' | 'missing_from_address';
    }
  | {
      sent: false;
      skipped: false;
      provider: 'resend';
      recipientEmail: string;
      error: string;
    };

const DEFAULT_RESEND_DEV_FROM = 'Camera <onboarding@resend.dev>';

function getEmailApiKey(): string {
  return (process.env.RESEND_API_KEY || process.env.RESEND || process.env.EMAIL_API_KEY || '').trim();
}

function getEmailFrom(): string {
  const configuredFrom = (
    process.env.CAMERA_EMAIL_FROM ||
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM ||
    ''
  ).trim();

  if (configuredFrom) {
    return configuredFrom;
  }

  if (process.env.NODE_ENV === 'production') {
    return '';
  }

  return DEFAULT_RESEND_DEV_FROM;
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

function summarizeResendError(error: unknown): string {
  if (error && typeof error === 'object') {
    const details: string[] = [];
    const typedError = error as Record<string, unknown>;

    if (typeof typedError.message === 'string' && typedError.message.trim()) {
      details.push(typedError.message.trim());
    }
    if (typeof typedError.name === 'string' && typedError.name.trim()) {
      details.push(`[${typedError.name.trim()}]`);
    }

    const statusCode = typedError.statusCode ?? typedError.status;
    if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
      details.push(`HTTP ${statusCode}`);
    } else if (typeof statusCode === 'string' && statusCode.trim()) {
      details.push(`HTTP ${statusCode.trim()}`);
    }

    if (typeof typedError.code === 'string' && typedError.code.trim()) {
      details.push(`code=${typedError.code.trim()}`);
    }
    if (typeof typedError.type === 'string' && typedError.type.trim()) {
      details.push(`type=${typedError.type.trim()}`);
    }

    if (details.length > 0) {
      return details.join(' ');
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Resend rejected the email';
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

  const apiKey = getEmailApiKey();
  if (!apiKey) {
    console.warn('[email] Submission result email skipped: RESEND API key missing', {
      eventName: input.eventName || null,
      hasResendKey: Boolean(process.env.RESEND_API_KEY || process.env.RESEND || process.env.EMAIL_API_KEY),
    });
    return { sent: false, skipped: true, reason: 'missing_api_key' };
  }

  const from = getEmailFrom();
  if (!from) {
    console.error('[email] Submission result email skipped: missing configured sender address', {
      eventName: input.eventName || null,
      hasCameraEmailFrom: Boolean(process.env.CAMERA_EMAIL_FROM || process.env.EMAIL_FROM || process.env.RESEND_FROM),
      nodeEnv: process.env.NODE_ENV || 'unknown',
    });
    return { sent: false, skipped: true, reason: 'missing_from_address' };
  }

  if (from === DEFAULT_RESEND_DEV_FROM && process.env.NODE_ENV === 'production') {
    console.error('[email] Submission result email skipped: production sender points to onboarding domain', {
      eventName: input.eventName || null,
      from,
    });
    return { sent: false, skipped: true, reason: 'missing_from_address' };
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
      from,
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
      const errorMessage = summarizeResendError(response.error);
      console.error('[email] Submission result email rejected by Resend', {
        eventName: input.eventName || null,
        recipientEmail,
        from,
        resendError: response.error,
        error: errorMessage,
      });
      return {
        sent: false,
        skipped: false,
        provider: 'resend',
        recipientEmail,
        error: errorMessage,
      };
    }

    console.info('[email] Submission result email queued successfully', {
      eventName: input.eventName || null,
      recipientEmail,
      messageId: response.data?.id,
    });

    return {
      sent: true,
      provider: 'resend',
      messageId: response.data?.id ?? null,
      recipientEmail,
    };
  } catch (error) {
    const errorMessage = summarizeResendError(error);
    console.error('[email] Submission result email failed', {
      eventName: input.eventName || null,
      recipientEmail,
      from,
      error: errorMessage,
    });
    return {
      sent: false,
      skipped: false,
      provider: 'resend',
      recipientEmail,
      error: errorMessage,
    };
  }
}
