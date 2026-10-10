import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approvalTexts, DEFAULT_APPROVAL_TEXTS, DEFAULT_REDIRECTING_TEXT, redirectingText } from './page-texts';

test('the redirecting message is the editor\'s text, "Opening…" when it is empty', () => {
  assert.equal(DEFAULT_REDIRECTING_TEXT, 'Opening…');
  assert.equal(redirectingText('Ti reindirizzeremo a breve...'), 'Ti reindirizzeremo a breve...');
  for (const empty of [undefined, null, '', '   ']) assert.equal(redirectingText(empty), 'Opening…');
});

test('without settings the four approval texts are the texts the code always showed', () => {
  assert.deepEqual(approvalTexts(undefined), {
    previewNotice: 'Your photo will get its frame after it has been approved.',
    savedMessage: 'Thank you! Your photo is waiting for approval.',
    title: 'Thank you!',
    waitingMessage: 'Your photo is waiting for approval. We will email you the link to it as soon as it is approved.',
    savedMessageIsOwn: false,
  });
  assert.deepEqual(approvalTexts({}), approvalTexts(undefined));
});

test('empty settings fall back to the defaults, filled settings replace them one by one', () => {
  const empty = approvalTexts({ pendingPreviewNotice: '', pendingSavedMessage: '  ', pendingTitle: '', pendingWaitingMessage: '' });
  assert.deepEqual(empty, approvalTexts(undefined));
  const own = approvalTexts({ pendingTitle: 'Grazie!', pendingSavedMessage: 'La tua foto è in attesa.' });
  assert.equal(own.title, 'Grazie!');
  assert.equal(own.savedMessage, 'La tua foto è in attesa.');
  assert.equal(own.previewNotice, DEFAULT_APPROVAL_TEXTS.previewNotice, 'what is not set keeps its default');
  assert.equal(own.waitingMessage, DEFAULT_APPROVAL_TEXTS.waitingMessage);
});

test('an own waiting message is shown as written and nothing is added to the default one (the try-on sentence went with the try-on integration, issue 557)', () => {
  assert.equal(approvalTexts(undefined).waitingMessage, DEFAULT_APPROVAL_TEXTS.waitingMessage);
  assert.equal(approvalTexts({ pendingWaitingMessage: 'Presto avrai il link.' }).waitingMessage, 'Presto avrai il link.');
  assert.equal(approvalTexts({}, 'hu').waitingMessage.includes('próbakép'), false);
});

test('in Hungarian the defaults are Hungarian, a stored English default counts as not set, an own text wins, the waiting message follows the language', () => {
  const hu = approvalTexts({}, 'hu');
  assert.equal(hu.title, 'Köszönjük!');
  assert.match(hu.waitingMessage, /jóváhagyásra vár/);
  assert.deepEqual(approvalTexts({ pendingTitle: 'Thank you!', pendingSavedMessage: 'Thank you! Your photo is waiting for approval.' }, 'hu'), approvalTexts({}, 'hu'));
  assert.equal(approvalTexts({ pendingTitle: 'Köszi!' }, 'hu').title, 'Köszi!');
  assert.equal(redirectingText('Opening…', 'hu'), 'Megnyitás…');
  assert.equal(redirectingText(undefined, 'en'), 'Opening…');
});

test('a wording written for the partner or the event replaces the dictionary text, and an editor\'s own text on the page still wins', () => {
  const texts = { 'cta.opening': 'Egy pillanat…', 'approval.title': 'Várunk a jóváhagyásra' };
  assert.equal(redirectingText('', 'en', texts), 'Egy pillanat…');
  assert.equal(redirectingText('My own', 'en', texts), 'My own');
  assert.equal(approvalTexts(undefined, 'en', texts).title, 'Várunk a jóváhagyásra');
  assert.equal(approvalTexts({ pendingTitle: 'Own title' }, 'en', texts).title, 'Own title');
  assert.equal(approvalTexts(undefined, 'en', texts).savedMessage, DEFAULT_APPROVAL_TEXTS.savedMessage, 'a text with no wording is the dictionary one');
  assert.equal(approvalTexts(undefined, 'en', null).title, DEFAULT_APPROVAL_TEXTS.title);
});

test('the standard saved message is not an extra notice, one an editor wrote is', () => {
  assert.equal(approvalTexts(undefined, 'en').savedMessageIsOwn, false);
  assert.equal(approvalTexts({ pendingSavedMessage: DEFAULT_APPROVAL_TEXTS.savedMessage }, 'en').savedMessageIsOwn, false, 'the editor saved the standard text as it was');
  assert.equal(approvalTexts({ pendingSavedMessage: 'Köszi, megvan!' }, 'en').savedMessageIsOwn, true);
  assert.equal(approvalTexts({ pendingSavedMessage: DEFAULT_APPROVAL_TEXTS.savedMessage }, 'hu').savedMessageIsOwn, false, 'in Hungarian a stored English default counts as not set');
  assert.equal(approvalTexts(undefined, 'hu', { 'approval.saved': 'Elmentettük' }).savedMessageIsOwn, false, 'a wording of a level is a default too, not an editor\'s own text on the page');
});
