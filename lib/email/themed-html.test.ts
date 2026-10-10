import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveEventTheme } from '@/lib/theme/event-theme';
import { nativeFrameContext } from '@/lib/frame/context';
import { EMAIL_WRAP_STYLE, parseRich, resolveRich, richHtml } from './rich';
import { escapeHtml, renderThemedEmail } from './themed-html';

const paragraphHtml = (text: string, link: string) => richHtml(resolveRich(parseRich(text), {}).blocks, { link });

const NOW = '2026-10-06T12:00:00.000Z';
const theme = resolveEventTheme({ context: nativeFrameContext({ eventName: '🏀 Hungary x Iceland', partnerName: 'MKOSZ', partnerLogoUrl: null }, NOW) });

test('text is escaped, links become anchors in the link colour and line breaks are kept', () => {
  assert.equal(escapeHtml(`<b onclick="x">&'`), '&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;');
  const html = paragraphHtml('Hi <Ann>,\nsee https://camera.test/share/abc123. Thanks', theme.link);
  assert.ok(html.includes('Hi &lt;Ann&gt;,<br />see <a href="https://camera.test/share/abc123"'), html);
  assert.ok(html.includes(`color:${theme.link}`));
  assert.ok(html.endsWith('. Thanks</p>'), 'the full stop after the link stays outside it');
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

test('the event\'s footer picture sits under the card, full width, and is absent when the event has none', () => {
  const FOOTER = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/landing/mtk-vasas/footer.png';
  const withFooter = resolveEventTheme({ context: nativeFrameContext({ eventName: 'Derby', partnerName: 'MTK', partnerLogoUrl: null }, NOW), emailFooterImageUrl: FOOTER });
  assert.equal(withFooter.emailFooterImageUrl, FOOTER);
  const html = renderThemedEmail({ theme: withFooter, eventName: 'Derby', bodyText: 'Hi', button: null });
  const footer = html.indexOf(`<img src="${FOOTER}"`);
  assert.ok(footer > html.indexOf('Hi') && footer > 0, 'after the message card');
  assert.match(html.slice(footer, html.indexOf('>', footer)), /width="560"[^>]*max-width:560px;height:auto/);
  assert.equal(renderThemedEmail({ theme, eventName: 'Derby', bodyText: 'Hi', button: null }).includes('landing/mtk-vasas'), false);
  const refused = resolveEventTheme({ context: nativeFrameContext({ eventName: 'Derby', partnerName: 'MTK', partnerLogoUrl: null }, NOW), emailFooterImageUrl: 'https://evil.example.test/x.png' });
  assert.equal(refused.emailFooterImageUrl, null, 'an address the pages may not load images from is not used');
  assert.equal(resolveEventTheme({ emailFooterImageUrl: 'http://i.ibb.co/x/f.png' }).emailFooterImageUrl, null, 'https only');
});

// ---- A long link must not make the e-mail wider than a phone screen (issue 382) ----

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8';
const LONG = `https://camera.messmass.com/share/${TOKEN}`;

test('the e-mail cannot be wider than the screen: fixed table layouts, the wrap rule on every cell that holds words, a viewport line, and a button that may shrink', () => {
  const html = renderThemedEmail({
    theme,
    eventName: 'MTK-Budapest-x-Vasas-FC-Derby-2026-10-16-Final-Super-Long-Event-Name',
    bodyText: `Hi,\n\nSee ${LONG}`,
    legal: resolveRich(parseRich(`Terms: ${LONG}`), {}, ['link']).blocks,
    button: { label: 'View your photo', url: LONG },
  });
  const tables = html.match(/<table [^>]*>/g) ?? [];
  const layoutTables = tables.filter((table) => table.includes('width="100%"'));
  assert.equal(layoutTables.length, 2, 'the page table and the 560 px table');
  for (const table of layoutTables) assert.ok(table.includes('table-layout:fixed'), table);
  assert.ok(html.includes('name="viewport" content="width=device-width'));
  // The header cell, its event name, the card, the legal part and the button each break a long word.
  for (const marker of ['text-align:center;color:' + theme.heading, 'font-size:20px;font-weight:700', 'padding:24px;', 'margin-top:20px;', 'display:inline-block;padding:14px 28px']) {
    const at = html.indexOf(marker);
    assert.ok(at > 0, marker);
    assert.ok(html.slice(at, html.indexOf('>', at)).includes(EMAIL_WRAP_STYLE), `${marker} may break a long word`);
  }
  assert.ok(html.includes('max-width:100%;font-family'), 'the button may be narrower than its label');
  // The whole link is still the target of the text link and of the button.
  assert.equal(html.split(`href="${LONG}"`).length - 1, 3, 'the text, the legal part and the button all lead to the whole link');
});
