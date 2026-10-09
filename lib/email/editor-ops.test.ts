import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insertAt, linkAddressProblem, makeLink, paragraphKindAt, setParagraphKind, wrapSelection } from './editor-ops';
import { parseRich } from './rich';

test('bold and italic go around the selection and come off again; with nothing selected a word to type over is put in', () => {
  assert.deepEqual(wrapSelection('Hello world', 6, 11, '**'), { text: 'Hello **world**', start: 8, end: 13 });
  assert.deepEqual(wrapSelection('Hello world', 6, 11, '*'), { text: 'Hello *world*', start: 7, end: 12 });
  assert.deepEqual(wrapSelection('Hello **world**', 8, 13, '**'), { text: 'Hello world', start: 6, end: 11 }, 'the marks outside the selection come off');
  assert.deepEqual(wrapSelection('Hello **world**', 6, 15, '**'), { text: 'Hello world', start: 6, end: 11 }, 'and so do the marks inside it');
  assert.deepEqual(wrapSelection('Hi ', 3, 3, '**'), { text: 'Hi **text**', start: 5, end: 9 });
  assert.equal(wrapSelection('a **b** c', 4, 5, '*').text, 'a ***b*** c', 'italic on a bold word adds italic, it does not take the bold away');
});

test('what the toolbar writes is read back by the format: bold, italic, a link, a title', () => {
  let edit = wrapSelection('Hello world', 6, 11, '**');
  edit = setParagraphKind(edit.text, 0, 'title');
  assert.equal(edit.text, '# Hello **world**');
  const block = parseRich(edit.text)[0];
  assert.equal(block.kind, 'title');
  assert.ok(block.inlines.some((inline) => inline.t === 'bold'));
  const link = makeLink('See the photo now', 4, 13, 'https://camera.test/p');
  assert.equal(link.text, 'See [the photo](https://camera.test/p) now');
  assert.ok(parseRich(link.text)[0].inlines.some((inline) => inline.t === 'link'));
});

test('a paragraph becomes a title, small or large text; the same kind again, or another, replaces the mark', () => {
  const text = 'One\n\nTwo words\n\nThree';
  assert.equal(setParagraphKind(text, 6, 'small').text, 'One\n\n-# Two words\n\nThree');
  assert.equal(setParagraphKind('One\n\n-# Two words\n\nThree', 8, 'small').text, 'One\n\nTwo words\n\nThree', 'again: back to normal');
  assert.equal(setParagraphKind('One\n\n-# Two words\n\nThree', 8, 'title').text, 'One\n\n# Two words\n\nThree', 'another kind replaces it');
  assert.equal(setParagraphKind(text, 0, 'large').text, '+# One\n\nTwo words\n\nThree');
  assert.equal(setParagraphKind(text, text.length, 'title').text, 'One\n\nTwo words\n\n# Three');
  assert.equal(paragraphKindAt('+# Big', 2), 'large');
  assert.equal(paragraphKindAt('a\n\n-# s', 6), 'small');
  assert.equal(paragraphKindAt('plain', 2), 'normal');
  assert.equal(setParagraphKind('', 0, 'title').text, '# ');
});

test('a link takes the selected words as its label, or a label to type over; a variable goes in place of the selection', () => {
  assert.deepEqual(makeLink('Go now', 0, 0, ' {link} '), { text: '[link text]({link})Go now', start: 1, end: 10 });
  assert.deepEqual(insertAt('Hi , bye', 3, 3, '{name}'), { text: 'Hi {name}, bye', start: 9, end: 9 });
  assert.equal(insertAt('Hi NAME bye', 3, 7, '{name}').text, 'Hi {name} bye');
});

test('the address of a link: https, http, mailto or a link variable', () => {
  for (const ok of ['https://a.test/x', 'http://a.test', 'mailto:a@b.hu', '{link}', '{terms}', '{EVENTLINK}']) assert.equal(linkAddressProblem(ok), null, ok);
  for (const bad of ['', '   ', 'a.test', 'javascript:alert(1)', 'https://a.test/ x', '{name}', 'ftp://a.test']) assert.notEqual(linkAddressProblem(bad), null, bad);
});
