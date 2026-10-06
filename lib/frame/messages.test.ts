import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FRAME_MESSAGES,
  fillMessage,
  MAX_FRAME_MESSAGE_LENGTH,
  MAX_FRAME_MESSAGES,
  pickMessage,
  usableMessages,
  validateMessages,
} from './messages';

test('the default list is the five messages the owner chose, and it is valid', () => {
  assert.deepEqual([...DEFAULT_FRAME_MESSAGES], ['Go! Go! Go!', 'Let’s Go, {partner1}', 'We are the Best!', 'Together for Victory!', '🫶 Let’s Go 🫶']);
  assert.deepEqual(validateMessages([...DEFAULT_FRAME_MESSAGES]), { ok: true, messages: [...DEFAULT_FRAME_MESSAGES] });
});

test('{partner1} is the home name and {partner2} the visitor', () => {
  assert.equal(fillMessage('Let’s Go, {partner1}', { partner1: ' FC Barcelona ' }), 'Let’s Go, FC Barcelona');
  assert.equal(fillMessage('{partner1} v {partner2}', { partner1: 'A', partner2: 'B' }), 'A v B');
  assert.equal(fillMessage('We are the Best!', {}), 'We are the Best!');
});

test('a placeholder that cannot be filled makes the message unusable, and a raw placeholder is never returned', () => {
  assert.equal(fillMessage('Let’s Go, {partner1}', {}), null);
  assert.equal(fillMessage('Let’s Go, {partner1}', { partner1: '   ' }), null);
  assert.equal(fillMessage('Hi {coach}', { partner1: 'A' }), null);
});

test('usable messages keep their position in the list and skip the unfillable ones', () => {
  const usable = usableMessages(DEFAULT_FRAME_MESSAGES, {});
  assert.deepEqual(usable.map((m) => m.index), [0, 2, 3, 4]);
  assert.equal(usableMessages(DEFAULT_FRAME_MESSAGES, { partner1: 'AS Roma' }).length, 5);
});

test('the pick is random among the usable ones and never repeats the previous one', () => {
  const usable = usableMessages(DEFAULT_FRAME_MESSAGES, { partner1: 'AS Roma' });
  for (const previous of [0, 1, 2, 3, 4]) {
    for (const random of [0, 0.25, 0.5, 0.75, 0.999999]) {
      assert.notEqual(pickMessage(usable, previous, () => random)?.index, previous);
    }
  }
  assert.equal(pickMessage(usable, null, () => 0)?.index, 0);
  assert.equal(pickMessage(usable, null, () => 0.999999)?.index, 4);
});

test('a single usable message is picked again, none gives none', () => {
  const one = [{ index: 2, text: 'We are the Best!' }];
  assert.equal(pickMessage(one, 2, () => 0)?.index, 2);
  assert.equal(pickMessage([], null), null);
});

test('the editor may save up to 10 trimmed messages', () => {
  assert.deepEqual(validateMessages(['  Go!  ', 'Hello {partner2}']), { ok: true, messages: ['Go!', 'Hello {partner2}'] });
  assert.deepEqual(validateMessages([]), { ok: true, messages: [] });
  assert.equal(validateMessages(Array.from({ length: MAX_FRAME_MESSAGES }, () => 'Go!')).ok, true);
  assert.equal(validateMessages(Array.from({ length: MAX_FRAME_MESSAGES + 1 }, () => 'Go!')).ok, false);
});

test('empty, over-long, non-text, unknown placeholder and stray brace are refused', () => {
  assert.equal(validateMessages(['ok', '   ']).ok, false);
  assert.equal(validateMessages(['x'.repeat(MAX_FRAME_MESSAGE_LENGTH + 1)]).ok, false);
  assert.equal(validateMessages(['x'.repeat(MAX_FRAME_MESSAGE_LENGTH)]).ok, true);
  assert.equal(validateMessages([42]).ok, false);
  assert.equal(validateMessages('Go!').ok, false);
  assert.match((validateMessages(['Hi {coach}']) as { error: string }).error, /unknown placeholder \{coach\}/);
  assert.match((validateMessages(['Hi }{']) as { error: string }).error, /stray brace/);
});

test('an emoji counts as one character toward the length limit', () => {
  assert.equal(validateMessages(['🫶'.repeat(MAX_FRAME_MESSAGE_LENGTH)]).ok, true);
  assert.equal(validateMessages(['🫶'.repeat(MAX_FRAME_MESSAGE_LENGTH + 1)]).ok, false);
});
