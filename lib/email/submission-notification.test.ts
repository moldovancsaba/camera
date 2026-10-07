import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { nativeFrameContext } from '@/lib/frame/context';
import { resolveEventTheme } from '@/lib/theme/event-theme';

type NotificationModule = typeof import('./submission-notification');

async function setup(t: TestContext) {
  const sent: Array<{ to: string; subject: string; html: string; text?: string }> = [];
  t.mock.module('@/lib/email/send', {
    namedExports: {
      getResendApiKey: () => 'key',
      sendEmail: async (message: { to: string; subject: string; html: string; text?: string }) => (sent.push(message), { sent: true, messageId: 'm1' }),
    },
  });
  process.env.CAMERA_EMAIL_FROM = 'Camera <noreply@example.test>';
  const loaded = (await import('./submission-notification?case=' + Math.random().toString(36).slice(2))) as NotificationModule;
  return { sent, send: loaded.sendSubmissionResultEmail };
}

const base = { recipientEmail: 'ann@example.com', recipientName: 'Ann', eventName: 'Derby', shareUrl: 'https://camera.test/share/abc123', bodyTemplate: 'Hi {name},\n\nyour photo: {link}' };

test('without a theme the email keeps its plain layout', async (t) => {
  const { sent, send } = await setup(t);
  assert.equal((await send(base)).sent, true);
  assert.ok(sent[0].html.includes('font-family: Arial'), 'the plain layout');
  assert.equal(sent[0].html.includes('<table'), false);
});

test('with a theme the email is drawn in the event\'s colours with a button to the link, and the text part is unchanged', async (t) => {
  const { sent, send } = await setup(t);
  const theme = resolveEventTheme({ context: nativeFrameContext({ eventName: 'Derby', partnerName: 'Club', partnerLogoUrl: null }, '2026-10-06T12:00:00.000Z') });
  assert.equal((await send({ ...base, theme, buttonLabel: 'See your photo' })).sent, true);
  const message = sent[0];
  assert.ok(message.html.includes(`background:${theme.background}`) && message.html.includes(`background:${theme.buttonBackground}`));
  assert.ok(message.html.includes('See your photo') && message.html.includes('href="https://camera.test/share/abc123"'));
  assert.equal(message.text, 'Hi Ann,\n\nyour photo: https://camera.test/share/abc123');
});
