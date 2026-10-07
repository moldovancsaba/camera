import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEventTheme } from '@/lib/theme/event-theme';
import { nativeFrameContext } from '@/lib/frame/context';
import { escapeHtml, paragraphHtml, renderThemedEmail } from './themed-html';

const NOW = '2026-10-06T12:00:00.000Z';
const theme = resolveEventTheme({ context: nativeFrameContext({ eventName: '🏀 Hungary x Iceland', partnerName: 'MKOSZ', partnerLogoUrl: null }, NOW) });

test('text is escaped, links become anchors in the link colour and line breaks are kept', () => {
  assert.equal(escapeHtml(`<b onclick="x">&'`), '&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;');
  const html = paragraphHtml('Hi <Ann>,\nsee https://camera.test/share/abc123. Thanks', theme.link);
  assert.ok(html.includes('Hi &lt;Ann&gt;,<br />see <a href="https://camera.test/share/abc123"'), html);
  assert.ok(html.includes(`color:${theme.link}`));
  assert.ok(html.endsWith('. Thanks'), 'the full stop after the link stays outside it');
  assert.equal(html.includes('<Ann>'), false);
});

test('the email carries the theme: page band, card, button, event name and the emoji when there is no logo', () => {
  const html = renderThemedEmail({ theme, eventName: 'Hungary x Iceland', bodyText: 'Hi Ann,\n\nYour photo is ready.', button: { label: 'View your photo', url: 'https://camera.test/share/abc123' } });
  assert.ok(html.includes(`background:${theme.background}`));
  assert.ok(html.includes(`background:${theme.cardBackground}`));
  assert.ok(html.includes(`background:${theme.buttonBackground}`) && html.includes(`color:${theme.buttonText}`));
  assert.ok(html.includes('Hungary x Iceland') && html.includes('🏀'));
  assert.ok(html.includes('href="https://camera.test/share/abc123"') && html.includes('View your photo'));
  assert.equal((html.match(/<p /g) ?? []).length, 2, 'one paragraph per block of text');
});

test('a logo is shown as an image, and an email without a button has no button', () => {
  const logo = { ...theme, logoUrl: 'https://i.ibb.co/x/logo.png', emoji: null };
  const html = renderThemedEmail({ theme: logo, eventName: 'Derby', bodyText: 'Hello', button: null });
  assert.ok(html.includes('<img src="https://i.ibb.co/x/logo.png"'));
  assert.equal(html.includes('View your photo'), false);
  assert.equal(html.includes('display:inline-block;padding:14px'), false);
});

test('an event name or a link that tries to break out of its place is escaped', () => {
  const html = renderThemedEmail({ theme, eventName: '<script>alert(1)</script>', bodyText: 'x', button: { label: '"><b>', url: 'https://camera.test/?a="b' } });
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('"><b>'), false);
  assert.equal(html.includes('a="b'), false);
});
