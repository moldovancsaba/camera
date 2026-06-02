import { loadEnvFromFiles } from './load-env-from-files';
import { sendSubmissionResultEmail } from '../lib/email/submission-notification';

loadEnvFromFiles();

const recipientEmail = process.env.RESEND_TEST_TO || process.env.EMAIL_TEST_TO || '';
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!recipientEmail.trim()) {
  console.error('Missing RESEND_TEST_TO. Example: RESEND_TEST_TO=you@example.com npm run email:test');
  process.exit(1);
}

const result = await sendSubmissionResultEmail({
  recipientEmail,
  recipientName: 'Camera test user',
  eventName: 'Camera email smoke test',
  shareUrl: `${appUrl}/share/test-email-smoke`,
});

if (!result.sent) {
  console.error('Email smoke test failed.');
  console.error(result);
  process.exit(1);
}

console.log('Email smoke test accepted by Resend.');
console.log({
  provider: result.provider,
  messageId: result.messageId,
  recipientEmail: result.recipientEmail,
});
