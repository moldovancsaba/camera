/**
 * Low-level Resend send primitive, shared by every email path in Camera --
 * both its own submission-notification flow (lib/email/submission-notification.ts)
 * and the internal cross-app email service (app/api/internal/email/send).
 *
 * WHY this exists: before this, submission-notification.ts instantiated Resend
 * and handled its errors inline. Pulling that into one place means the actual
 * "call Resend, interpret the response/error" logic exists exactly once in the
 * whole SEYU stack -- messmass calls THIS (via the internal API), it does not
 * have its own Resend integration. See SSO_EMAIL_UNIFICATION_PLAN.md.
 */

import { Resend } from 'resend';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Full "Name <address>" string. Falls back to CAMERA_EMAIL_FROM when omitted. */
  from?: string;
}

export type SendEmailResult =
  | { sent: true; messageId: string | null }
  | { sent: false; error: string };

export function getResendApiKey(): string {
  return (process.env.RESEND_API_KEY || process.env.RESEND || process.env.EMAIL_API_KEY || '').trim();
}

export function getDefaultFrom(): string {
  return (process.env.CAMERA_EMAIL_FROM || '').trim();
}

/** The verified sending domain, parsed out of CAMERA_EMAIL_FROM (e.g. "Name <x@domain>" -> "domain"). */
export function getVerifiedSendingDomain(): string {
  const configured = getDefaultFrom();
  const match = configured.match(/<\s*[^@\s]+@([^>\s]+)\s*>/) || configured.match(/^[^@\s]+@(\S+)$/);
  return match ? match[1] : '';
}

export function summarizeResendError(error: unknown): string {
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

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return { sent: false, error: 'missing_api_key' };
  }

  const from = (input.from || getDefaultFrom()).trim();
  if (!from) {
    return { sent: false, error: 'missing_from_address' };
  }

  try {
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
    });

    if (response.error) {
      return { sent: false, error: summarizeResendError(response.error) };
    }

    return { sent: true, messageId: response.data?.id ?? null };
  } catch (error) {
    return { sent: false, error: summarizeResendError(error) };
  }
}
