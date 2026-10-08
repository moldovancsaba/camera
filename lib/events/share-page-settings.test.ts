import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EVENT_SHARE_PAGE_SETTINGS, normalizeEventSharePageSettings, normalizeSharePageTexts, SHARE_PAGE_TEXT_DEFAULTS, sharePageText } from './share-page-settings';

test('the defaults are the fixed texts the public page always showed', () => {
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.downloadButton, 'Download');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.createYourOwnButton, 'Create Your Own');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.relatedPhotosTitle, 'Related photos');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.originalPhotoLabel, 'Original photo taken');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.waitingTitle, 'Waiting for approval');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.notApprovedTitle, 'Not approved');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.takeAnotherPhotoButton, 'Take another photo');
});

test('an event without texts, or with empty ones, shows the defaults; nothing is frozen into the settings', () => {
  assert.deepEqual(DEFAULT_EVENT_SHARE_PAGE_SETTINGS.texts, {});
  assert.deepEqual(normalizeEventSharePageSettings(undefined).texts, {});
  assert.deepEqual(normalizeEventSharePageSettings({ texts: { downloadButton: '', waitingTitle: '   ' } }).texts, {});
  assert.equal(sharePageText(undefined, 'downloadButton'), 'Download');
  assert.equal(sharePageText({ texts: { downloadButton: ' ' } }, 'downloadButton'), 'Download');
});

test('an own text replaces its default, trimmed and limited; unknown keys and non-text values are dropped', () => {
  const texts = normalizeSharePageTexts({ downloadButton: '  Letöltés  ', relatedPhotosTitle: 'x'.repeat(900), evil: '<script>', waitingTitle: 42, createYourOwnButton: null });
  assert.equal(texts.downloadButton, 'Letöltés');
  assert.equal(texts.relatedPhotosTitle?.length, 500);
  assert.deepEqual(Object.keys(texts).sort(), ['downloadButton', 'relatedPhotosTitle']);
  assert.equal(sharePageText({ texts }, 'downloadButton'), 'Letöltés');
  assert.equal(sharePageText({ texts }, 'waitingTitle'), 'Waiting for approval', 'a text that was not written stays the default');
});

test('the texts are kept next to the settings the page already had', () => {
  const settings = normalizeEventSharePageSettings({ showCreateYourOwnButton: true, pendingTryOnMessage: 'Soon.', texts: { downloadButton: 'Save' } });
  assert.equal(settings.showCreateYourOwnButton, true);
  assert.equal(settings.pendingTryOnMessage, 'Soon.');
  assert.equal(settings.texts.downloadButton, 'Save');
});
