import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailDefaults } from './submission-template-defaults';
import { escapeHtml } from './escape';
import { fillPlain, parseRich, resolveRich, richHtml, richText, safeHref, type Values } from './rich';

const STYLE = { link: 'LINK' };
const URLS = ['link', 'terms'];
const html = (source: string, values: Values = {}) => richHtml(resolveRich(parseRich(source), values, URLS).blocks, STYLE);
const text = (source: string, values: Values = {}) => richText(resolveRich(parseRich(source), values, URLS).blocks);

/** The paragraph drawing the e-mails had before the format existed: escaped, web addresses as links, line breaks kept. */
const URL_IN_TEXT = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
const oldParagraph = (value: string) => `<p style="margin:0 0 16px 0;">${escapeHtml(value).replace(URL_IN_TEXT, (url) => `<a href="${url}" style="color:LINK;text-decoration:underline;">${url}</a>`).replace(/\n/g, '<br />')}</p>`;
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
  assert.equal(html('a **bold** and *italic* word'), '<p style="margin:0 0 16px 0;">a <strong>bold</strong> and <em>italic</em> word</p>');
  assert.equal(html('**bold *and italic***'), '<p style="margin:0 0 16px 0;"><strong>bold <em>and italic</em></strong></p>');
  const link = html('see [the photo](https://camera.test/p) now');
  assert.ok(link.includes('<a href="https://camera.test/p" style="color:LINK;font-weight:700;text-decoration:underline;">the photo</a>'), link);
  assert.ok(html('**[go](https://camera.test/p)**').includes('<strong><a href="https://camera.test/p"'));
  const bare = html('visit https://camera.test/p. Bye');
  assert.ok(bare.includes('<a href="https://camera.test/p" style="color:LINK;text-decoration:underline;">') && bare.endsWith('. Bye</p>'));
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
  assert.equal(html('one\ntwo'), '<p style="margin:0 0 16px 0;">one<br />two</p>');
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
