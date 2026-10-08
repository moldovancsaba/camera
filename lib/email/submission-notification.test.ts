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

const theme = () => resolveEventTheme({ context: nativeFrameContext({ eventName: 'Derby', partnerName: 'Club', partnerLogoUrl: null }, '2026-10-06T12:00:00.000Z') });
const defaultsOnly = { recipientEmail: 'ann@example.com', recipientName: 'Ann', eventName: 'Derby', shareUrl: 'https://camera.test/share/abc123', termsUrl: 'https://seyuselfies.com/en/policies/' };

test('in English the default email is word for word what it always was, and the button says Open your photo', async (t) => {
  const { sent, send } = await setup(t);
  await send({ ...defaultsOnly, theme: theme() });
  assert.equal(sent[0].subject, 'Your photo from Derby');
  assert.equal(
    sent[0].text,
    'Hi Ann,\n\nThank you for enjoying the Derby experience.\n\nYour photo is ready. Don\'t forget to share it on your social media!\nhttps://camera.test/share/abc123\n\nAI is fun, but it can make mistakes. If you want to make a new image, feel free to come back to us.\n\nWishing you an unforgettable time at Derby.\n\nPolicies and General Terms and Conditions:\nhttps://seyuselfies.com/en/policies/'
  );
  assert.ok(sent[0].html.includes('>Open your photo</a>'));
});

test('in English a guest without a name is greeted as before, and an unknown event is "your event"', async (t) => {
  const { sent, send } = await setup(t);
  await send({ ...defaultsOnly, recipientName: 'there', eventName: null, language: 'en' });
  assert.match(sent[0].text ?? '', /^Hi there,\n\nThank you for enjoying the your event experience\./);
  assert.equal(sent[0].subject, 'Your photo from your event');
});

test('in Hungarian the default email, its subject, its button and its terms link are Hungarian', async (t) => {
  const { sent, send } = await setup(t);
  await send({ ...defaultsOnly, termsUrl: 'https://seyuselfies.com/hu/policies/', theme: theme(), language: 'hu' });
  const message = sent[0];
  assert.equal(message.subject, 'A fotód – Derby');
  assert.match(message.text ?? '', /^Szia Ann!\n\nKöszönjük, hogy részt vettél az eseményen: Derby\.\n\nKész a fotód\./);
  assert.ok((message.text ?? '').includes('https://camera.test/share/abc123') && (message.text ?? '').endsWith('https://seyuselfies.com/hu/policies/'));
  assert.ok(message.html.includes('>Nyisd meg a fotódat</a>'), 'the button of the themed email');
  assert.equal(/\b(Hi|Thank you|Your photo|Open your photo)\b/.test(`${message.subject} ${message.text} ${message.html}`), false);
});

test('in Hungarian a guest without a name gets the Hungarian word, and the plain layout is Hungarian too', async (t) => {
  const { sent, send } = await setup(t);
  await send({ ...defaultsOnly, recipientName: 'there', language: 'hu' });
  assert.match(sent[0].text ?? '', /^Szia rajongó!/);
  assert.ok(sent[0].html.includes('Szia rajongó!') && sent[0].html.includes('font-family: Arial'));
});
