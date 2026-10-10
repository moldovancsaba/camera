import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailDefaults } from './submission-template-defaults';
import { escapeHtml } from './escape';
import { EMAIL_WRAP_STYLE, MAX_SHOWN_ADDRESS, fillPlain, parseRich, resolveRich, richHtml, richText, safeHref, shownAddress, type Values } from './rich';

const STYLE = { link: 'LINK' };
const URLS = ['link', 'terms'];
const html = (source: string, values: Values = {}) => richHtml(resolveRich(parseRich(source), values, URLS).blocks, STYLE);
const text = (source: string, values: Values = {}) => richText(resolveRich(parseRich(source), values, URLS).blocks);

/** The paragraph drawing the e-mails had before the format existed: escaped, web addresses as links, line breaks kept. Since issue 382 the paragraph and the link also carry the wrap rule (EMAIL_WRAP_STYLE); nothing else about a normal text changed. */
const URL_IN_TEXT = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
const oldParagraph = (value: string) => `<p style="margin:0 0 16px 0;${EMAIL_WRAP_STYLE}">${escapeHtml(value).replace(URL_IN_TEXT, (url) => `<a href="${url}" style="color:LINK;text-decoration:underline;${EMAIL_WRAP_STYLE}">${url}</a>`).replace(/\n/g, '<br />')}</p>`;
const oldHtml = (body: string) => body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).map(oldParagraph).join('');

test('a text with no markup is drawn exactly as e-mails were drawn before: the standard texts in English and Hungarian, filled in', () => {
  const values: Values = { name: 'Ann', event: 'MTK x Vasas', link: 'https://camera.test/share/abc', terms: 'https://seyuselfies.com/hu/policies/' };
  for (const language of ['en', 'hu'] as const) {
    const defaults = emailDefaults(language);
    for (const template of [defaults.body, defaults.resubmissionBody, defaults.notApprovedBody]) {
      const filled = template.replace(/\{(name|event|link|terms)\}/gi, (_m, key: string) => values[key.toLowerCase()] ?? '');
      assert.equal(html(template, values), oldHtml(filled), `${language}: ${template.slice(0, 30)}`);
    }
  }
});

test('titles, small and large text are paragraphs with a prefix; the others are normal', () => {
  const blocks = parseRich('# Hello\n\n-# Small print\n\n+# Big\n\nPlain');
  assert.deepEqual(blocks.map((b) => b.kind), ['title', 'small', 'large', 'normal']);
  const out = html('# Hello\n\n-# Small print');
  assert.ok(out.includes('font-size:22px') && out.includes('font-weight:700') && out.includes('>Hello</p>'));
  assert.ok(out.includes('font-size:12px') && out.includes('>Small print</p>'));
  assert.equal(parseRich('#NoSpace')[0].kind, 'normal', 'a title needs the space after #');
});

test('bold, italic, links with a label, a bare address and nesting', () => {
  assert.equal(html('a **bold** and *italic* word'), `<p style="margin:0 0 16px 0;${EMAIL_WRAP_STYLE}">a <strong>bold</strong> and <em>italic</em> word</p>`);
  assert.equal(html('**bold *and italic***'), `<p style="margin:0 0 16px 0;${EMAIL_WRAP_STYLE}"><strong>bold <em>and italic</em></strong></p>`);
  const link = html('see [the photo](https://camera.test/p) now');
  assert.ok(link.includes(`<a href="https://camera.test/p" style="color:LINK;font-weight:700;text-decoration:underline;${EMAIL_WRAP_STYLE}">the photo</a>`), link);
  assert.ok(html('**[go](https://camera.test/p)**').includes('<strong><a href="https://camera.test/p"'));
  const bare = html('visit https://camera.test/p. Bye');
  assert.ok(bare.includes(`<a href="https://camera.test/p" style="color:LINK;text-decoration:underline;${EMAIL_WRAP_STYLE}">`) && bare.endsWith('. Bye</p>'));
});

test('signs that are not a pair stay as they are, and a backslash writes the next sign', () => {
  assert.equal(text('5 * 3 * 2 = 30'), '5 * 3 * 2 = 30');
  assert.equal(text('a * b'), 'a * b');
  assert.equal(text('2 ** 3'), '2 ** 3');
  assert.equal(text('use \\*stars\\* and \\[brackets](x)'), 'use *stars* and [brackets](x)');
  assert.equal(text('#hashtag and -# not at the start'), '#hashtag and -# not at the start');
  assert.equal(text('[not a link] (x) and [also not](no closing'), '[not a link] (x) and [also not](no closing');
});

test('line breaks stay inside a paragraph and blank lines make paragraphs; empty paragraphs go', () => {
  assert.equal(html('one\ntwo'), `<p style="margin:0 0 16px 0;${EMAIL_WRAP_STYLE}">one<br />two</p>`);
  assert.equal((html('one\n\n\n\ntwo\n\n   \n\nthree').match(/<p /g) ?? []).length, 3);
  assert.equal(html(''), '');
});

test('the editor’s words are escaped: raw HTML never reaches the e-mail', () => {
  const out = html('<script>alert(1)</script> <b onclick="x">hi</b> &amp;');
  assert.equal(out.includes('<script>') || out.includes('<b '), false);
  assert.ok(out.includes('&lt;script&gt;') && out.includes('&amp;amp;'));
  assert.equal(html('[x](https://a.test/"onmouseover="y)').includes('onmouseover="'), false, 'an address cannot break out of its attribute');
});

test('variables are filled after the text is read: a value is never markup, and a user’s name is never a link', () => {
  const values: Values = { name: '**Ann** [click](https://evil.test) https://evil.test/x', link: 'https://camera.test/share/abc', event: '*Derby*' };
  const out = html('Hi {name}, your photo: {link} at {event}', values);
  assert.equal(out.includes('<strong>') || out.includes('<em>'), false, 'no markup from a value');
  assert.equal(out.includes('href="https://evil.test'), false, 'neither a labelled link nor an address typed as a name is a link');
  assert.ok(out.includes('**Ann** [click](https://evil.test) https://evil.test/x'), 'the name is shown as typed');
  assert.ok(out.includes('<a href="https://camera.test/share/abc"'), 'the link variable is a link');
});

test('a link may use a variable as its address; an address that is not http, https or mailto is not a link', () => {
  const values: Values = { link: 'https://camera.test/share/abc', name: 'javascript:alert(1)' };
  assert.ok(html('[Your photo]({link})', values).includes('<a href="https://camera.test/share/abc"'));
  const unsafe = html('[Go](javascript:alert(1)) and [Hi]({name})', values);
  assert.equal(unsafe.includes('<a '), false);
  assert.ok(unsafe.includes('Go') && unsafe.includes('Hi'), 'the labels stay');
  assert.equal(safeHref('mailto:a@b.hu'), 'mailto:a@b.hu');
  assert.equal(safeHref('https://a.test/x?y=1'), 'https://a.test/x?y=1');
  assert.equal(safeHref('ftp://a.test'), null);
  assert.equal(safeHref('//a.test'), null);
});

test('a variable with no value, or not a variable at all, is left out and reported, never sent as {name}', () => {
  const values: Values = { name: 'Ann', home: undefined, visitor: '' };
  const resolved = resolveRich(parseRich('Hi {name}, go {home}! Beat {visitor}, {nosuchthing}.'), values, URLS);
  const out = richText(resolved.blocks);
  assert.equal(out, 'Hi Ann, go ! Beat , .');
  assert.deepEqual(resolved.missing.sort(), ['home', 'visitor']);
  assert.deepEqual(resolved.unknown, ['nosuchthing']);
  assert.equal(/\{\w+\}/.test(out), false);
});

test('a paragraph that is only a variable with no value goes away; names are case-insensitive', () => {
  const resolved = resolveRich(parseRich('Hello\n\n{teams}\n\nBye {NAME}'), { name: 'Ann', teams: undefined }, URLS);
  assert.equal(richText(resolved.blocks), 'Hello\n\nBye Ann');
  assert.deepEqual(resolved.missing, ['teams']);
});

test('the subject is plain text with the variables filled in and the same rules for a missing value', () => {
  const filled = fillPlain('Your photo from {event} on {date}', { event: 'Derby', date: undefined });
  assert.equal(filled.text, 'Your photo from Derby on ');
  assert.deepEqual(filled.missing, ['date']);
  assert.deepEqual(fillPlain('{x}', {}).unknown, ['x']);
});

test('the plain-text part has no markup: a link is its label and its address, paragraphs are separated by a blank line', () => {
  assert.equal(text('# Title\n\nHi **Ann**, see [the photo](https://camera.test/p) or *later*\nBye'), 'Title\n\nHi Ann, see the photo (https://camera.test/p) or later\nBye');
  assert.equal(text('[https://camera.test/p](https://camera.test/p)'), 'https://camera.test/p', 'a label that is the address is not repeated');
});

const PIC = 'https://abc123.public.blob.vercel-storage.com/mail/banner.png';

test('a paragraph that is only a picture becomes a centred picture, with its description as the alternative text', () => {
  const out = html(`Hi\n\n![The stadium](${PIC})\n\nBye`);
  assert.equal(parseRich(`![x](${PIC})`)[0].kind, 'picture');
  assert.ok(out.includes(`<p style="margin:0 0 16px 0;text-align:center;"><img src="${PIC}" alt="The stadium" style="display:inline-block;max-width:100%;height:auto;border:0;" /></p>`), out);
  assert.equal((out.match(/<p /g) ?? []).length, 3, 'the text around it is still two paragraphs');
});

test('a picture inside a link is a picture that is a link; a variable may be the address, and a missing one drops the link, not the picture', () => {
  const out = html(`[![Banner](${PIC})]({link})`, { link: 'https://camera.test/share/abc' });
  assert.ok(out.includes('<a href="https://camera.test/share/abc" style="text-decoration:none;"><img src="'), out);
  assert.ok(html(`[![Banner](${PIC})](https://seyuselfies.com/hu/)`).includes('<a href="https://seyuselfies.com/hu/"'));
  const unlinked = resolveRich(parseRich(`[![Banner](${PIC})]({link})`), { link: undefined }, URLS);
  assert.equal(richHtml(unlinked.blocks, STYLE).includes('<a '), false);
  assert.deepEqual(unlinked.missing, ['link']);
  assert.equal(html(`[![Banner](${PIC})](javascript:x)`).includes('javascript'), false, 'an address that is not http(s) is no link');
});

test('a picture from anywhere but the app\'s own storage is left out and reported, never sent', () => {
  const bad = ['https://evil.test/track.png?x=1', 'http://i.ibb.co/a/b.png', 'data:image/png;base64,AAAA', 'https://evilbl.public.blob.vercel-storage.com.evil.test/a.png'];
  for (const src of bad) {
    const resolved = resolveRich(parseRich(`Hi\n\n![x](${src})`), {}, URLS);
    assert.deepEqual(resolved.refusedPictures, [src]);
    assert.equal(richHtml(resolved.blocks, STYLE).includes('<img'), false, src);
    assert.equal(richText(resolved.blocks), 'Hi');
  }
});

test('the description and the address are escaped; a picture with other words around it is ordinary text', () => {
  const out = html(`![a "quote" <b>](${PIC})`);
  assert.ok(out.includes('alt="a &quot;quote&quot; &lt;b&gt;"') && !out.includes('<b>'), out);
  const mixed = parseRich(`See ![x](${PIC}) here`);
  assert.equal(mixed[0].kind, 'normal');
  assert.equal(html(`See ![x](${PIC}) here`).includes('<img'), false);
});

test('the plain-text part names a picture by its description, and by its address when it is a link', () => {
  assert.equal(text(`Hi\n\n![The stadium](${PIC})`), 'Hi\n\nThe stadium');
  assert.equal(text(`[![Open the photo](${PIC})](https://camera.test/p)`), 'Open the photo: https://camera.test/p');
  assert.equal(text(`![](${PIC})\n\nBye`), 'Bye', 'a picture with no description adds no empty line');
});

// ---- A long link must not make the e-mail wider than a phone screen (issue 382) ----

// A long id, 96 characters with no break in it (low entropy on purpose: the secret scan reads a random-looking value next to a name like token as a credential).
const LONG_ID = 'a1b2c3'.repeat(16);
const LONG = `https://camera.messmass.com/share/${LONG_ID}`;

test('every paragraph and every link carries the wrap rule, so a long word breaks inside the e-mail', () => {
  const out = html(`# A title\n\n-# small print\n\n+# large\n\nSee ${LONG} and [your photo](${LONG}) and a-very-long-word-${'x'.repeat(80)}`);
  const paragraphs = out.match(/<p style="[^"]*"/g) ?? [];
  assert.equal(paragraphs.length, 4);
  for (const open of paragraphs) assert.ok(open.includes(EMAIL_WRAP_STYLE), open);
  const links = out.match(/<a [^>]*style="[^"]*"/g) ?? [];
  assert.equal(links.length, 2);
  for (const open of links) assert.ok(open.includes(EMAIL_WRAP_STYLE), open);
  assert.ok(EMAIL_WRAP_STYLE.includes('overflow-wrap:anywhere') && EMAIL_WRAP_STYLE.includes('word-wrap:break-word') && EMAIL_WRAP_STYLE.includes('word-break:break-word'));
});

test('a very long address in the text shows shortened, the link behind it stays whole, the plain-text part keeps the whole address', () => {
  const blocks = resolveRich(parseRich(`See ${LONG} now`), {}, URLS).blocks;
  const out = richHtml(blocks, STYLE);
  assert.ok(out.includes(`href="${LONG}"`), 'the link goes to the whole address');
  const shown = out.slice(out.indexOf('>', out.indexOf('<a ')) + 1, out.indexOf('</a>')).replace(/<wbr>/g, '');
  assert.equal(shown, shownAddress(LONG));
  assert.ok(shown.length <= MAX_SHOWN_ADDRESS && shown.endsWith('\u2026') && LONG.startsWith(shown.slice(0, -1)));
  assert.equal(richText(blocks), `See ${LONG} now`);
});

test('a normal address (a share link of about 60 characters, a short link) is written out whole and still breaks at its slashes', () => {
  const share = 'https://camera.messmass.com/share/6f2c1d0e9a8b7c6d5e4f3a2b';
  assert.ok(share.length < MAX_SHOWN_ADDRESS);
  const out = html(`Open ${share}`);
  assert.ok(out.includes(`href="${share}"`));
  assert.equal(out.replace(/<wbr>/g, '').includes(`>${share}</a>`), true, 'the whole address is the text of the link');
  assert.ok(out.includes('share/<wbr>6f2c'), 'a break point after the slash');
  assert.equal(out.includes('https:/<wbr>/'), false, 'none inside the two slashes after https:');
  // A short address has no break points at all, so it is drawn as it always was.
  assert.equal(html('Go https://go.messmass.com/mtk'), `<p style="margin:0 0 16px 0;${EMAIL_WRAP_STYLE}">Go <a href="https://go.messmass.com/mtk" style="color:LINK;text-decoration:underline;${EMAIL_WRAP_STYLE}">https://go.messmass.com/mtk</a></p>`);
});

test('the ellipsis never cuts an entity in half, and a query keeps its break points after the ampersand', () => {
  const query = `https://camera.messmass.com/share/${'q'.repeat(8)}?a=1&b=2&c=${'z'.repeat(60)}`;
  const out = html(`See ${query}`);
  assert.ok(out.includes('href="https://camera.messmass.com/share/' + 'q'.repeat(8) + '?a=1&amp;b=2&amp;c='), 'the href is escaped once');
  assert.equal(/&[a-z]*$/.test(out.slice(out.indexOf('>', out.indexOf('<a ')) + 1, out.indexOf('</a>'))), false, 'the shown text does not end inside an entity');
  assert.ok(out.includes('?<wbr>a=<wbr>1&amp;<wbr>b='));
});
