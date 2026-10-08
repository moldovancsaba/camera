import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approvalTexts, DEFAULT_APPROVAL_TEXTS, DEFAULT_REDIRECTING_TEXT, redirectingText, TRY_ON_WAITING_SENTENCE } from './page-texts';

test('the redirecting message is the editor\'s text, "Opening…" when it is empty', () => {
  assert.equal(DEFAULT_REDIRECTING_TEXT, 'Opening…');
  assert.equal(redirectingText('Ti reindirizzeremo a breve...'), 'Ti reindirizzeremo a breve...');
  for (const empty of [undefined, null, '', '   ']) assert.equal(redirectingText(empty), 'Opening…');
});

test('without settings the four approval texts are the texts the code always showed', () => {
  assert.deepEqual(approvalTexts(undefined, false), {
    previewNotice: 'Your photo will get its frame after it has been approved.',
    savedMessage: 'Thank you! Your photo is waiting for approval.',
    title: 'Thank you!',
    waitingMessage: 'Your photo is waiting for approval. We will email you the link to it as soon as it is approved.',
  });
  assert.deepEqual(approvalTexts({}, false), approvalTexts(undefined, false));
});

test('empty settings fall back to the defaults, filled settings replace them one by one', () => {
  const empty = approvalTexts({ pendingPreviewNotice: '', pendingSavedMessage: '  ', pendingTitle: '', pendingWaitingMessage: '' }, false);
  assert.deepEqual(empty, approvalTexts(undefined, false));
  const own = approvalTexts({ pendingTitle: 'Grazie!', pendingSavedMessage: 'La tua foto è in attesa.' }, false);
  assert.equal(own.title, 'Grazie!');
  assert.equal(own.savedMessage, 'La tua foto è in attesa.');
  assert.equal(own.previewNotice, DEFAULT_APPROVAL_TEXTS.previewNotice, 'what is not set keeps its default');
  assert.equal(own.waitingMessage, DEFAULT_APPROVAL_TEXTS.waitingMessage);
});

test('the try-on sentence is added to the default waiting message only, an own message is shown as written', () => {
  assert.equal(approvalTexts(undefined, true).waitingMessage, DEFAULT_APPROVAL_TEXTS.waitingMessage + TRY_ON_WAITING_SENTENCE);
  assert.equal(approvalTexts({ pendingWaitingMessage: 'Presto avrai il link.' }, true).waitingMessage, 'Presto avrai il link.');
});

test('in Hungarian the defaults are Hungarian, a stored English default counts as not set, an own text wins, the try-on sentence follows the language', () => {
  const hu = approvalTexts({}, false, 'hu');
  assert.equal(hu.title, 'Köszönjük!');
  assert.match(hu.waitingMessage, /jóváhagyásra vár/);
  assert.deepEqual(approvalTexts({ pendingTitle: 'Thank you!', pendingSavedMessage: 'Thank you! Your photo is waiting for approval.' }, false, 'hu'), approvalTexts({}, false, 'hu'));
  assert.equal(approvalTexts({ pendingTitle: 'Köszi!' }, false, 'hu').title, 'Köszi!');
  assert.match(approvalTexts({}, true, 'hu').waitingMessage, /Ezután készül el a próbaképed\.$/);
  assert.equal(redirectingText('Opening…', 'hu'), 'Megnyitás…');
  assert.equal(redirectingText(undefined, 'en'), 'Opening…');
});
