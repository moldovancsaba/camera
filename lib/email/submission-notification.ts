import { Resend } from 'resend';
import { sanitizeEmail } from '@/lib/security/sanitize';

export interface SubmissionNotificationInput {
  recipientEmail?: string | null;
  recipientName?: string | null;
  eventName?: string | null;
  shareUrl: string;
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
  const safeEventName = escapeHtml(eventName);
  const safeRecipientName = escapeHtml(recipientName);
  const safeShareUrl = escapeHtml(input.shareUrl);

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: getEmailFrom(),
      to: recipientEmail,
      subject: `Your photo from ${eventName}`,
      text: `Hi ${recipientName},\n\nYour photo is ready:\n${input.shareUrl}\n\nThanks for using Camera.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <p>Hi ${safeRecipientName},</p>
          <p>Your photo from ${safeEventName} is ready.</p>
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
