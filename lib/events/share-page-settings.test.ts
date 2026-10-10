import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_EVENT_SHARE_PAGE_SETTINGS, normalizeEventSharePageSettings, normalizeSharePageTexts, SHARE_PAGE_TEXT_DEFAULTS, sharePageText } from './share-page-settings';

test('the defaults are the fixed texts the public page always showed', () => {
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.downloadButton, 'Download');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.createYourOwnButton, 'Create Your Own');
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
  const texts = normalizeSharePageTexts({ downloadButton: '  Letöltés  ', takeAnotherPhotoButton: 'x'.repeat(900), evil: '<script>', waitingTitle: 42, createYourOwnButton: null });
  assert.equal(texts.downloadButton, 'Letöltés');
  assert.equal(texts.takeAnotherPhotoButton?.length, 500);
  assert.deepEqual(Object.keys(texts).sort(), ['downloadButton', 'takeAnotherPhotoButton']);
  assert.equal(sharePageText({ texts }, 'downloadButton'), 'Letöltés');
  assert.equal(sharePageText({ texts }, 'waitingTitle'), 'Waiting for approval', 'a text that was not written stays the default');
});

test('the texts are kept next to the settings the page already had', () => {
  const settings = normalizeEventSharePageSettings({ showCreateYourOwnButton: true, texts: { downloadButton: 'Save' } });
  assert.equal(settings.showCreateYourOwnButton, true);
  assert.equal(settings.texts.downloadButton, 'Save');
});

type TextKey = keyof typeof SHARE_PAGE_TEXT_DEFAULTS;
const TEXT_KEYS = Object.keys(SHARE_PAGE_TEXT_DEFAULTS) as TextKey[];

test('the English defaults stay word for word what the page showed before the language existed', () => {
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.waitingMessage, 'Your photo is waiting for approval. This page updates by itself, and we will email you the link as soon as it is approved.');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.notApprovedMessage, 'Your photo could not be approved, so it will not be published.');
  assert.equal(SHARE_PAGE_TEXT_DEFAULTS.notApprovedHint, 'You are welcome to take another photo.');
  assert.deepEqual([...TEXT_KEYS].sort(), ['createYourOwnButton', 'downloadButton', 'notApprovedHint', 'notApprovedMessage', 'notApprovedTitle', 'takeAnotherPhotoButton', 'waitingMessage', 'waitingTitle']);
  for (const key of TEXT_KEYS) {
    assert.equal(sharePageText(undefined, key, 'en'), SHARE_PAGE_TEXT_DEFAULTS[key], key);
    assert.equal(sharePageText(undefined, key), SHARE_PAGE_TEXT_DEFAULTS[key], `${key} without a language`);
  }
});

test('in Hungarian an empty field shows the Hungarian default, an own text wins, a stored English default counts as not set', () => {
  assert.equal(sharePageText(undefined, 'downloadButton', 'hu'), 'Letöltés');
  assert.equal(sharePageText({ texts: { downloadButton: '  ' } }, 'downloadButton', 'hu'), 'Letöltés');
  assert.equal(sharePageText({ texts: { downloadButton: 'Download' } }, 'downloadButton', 'hu'), 'Letöltés', 'the English default an editor may have saved');
  assert.equal(sharePageText({ texts: { downloadButton: 'Mentés a telefonra' } }, 'downloadButton', 'hu'), 'Mentés a telefonra');
  assert.equal(sharePageText({ texts: { downloadButton: 'Save it' } }, 'downloadButton', 'hu'), 'Save it', 'an English text the editor wrote is the editor’s own');
  assert.equal(sharePageText(undefined, 'waitingTitle', 'hu'), 'Jóváhagyásra vár');
  assert.equal(sharePageText(undefined, 'takeAnotherPhotoButton', 'hu'), 'Új fotó készítése');
  assert.equal(sharePageText({ texts: { downloadButton: 'Download' } }, 'downloadButton', 'en'), 'Download');
  for (const key of TEXT_KEYS) assert.notEqual(sharePageText(undefined, key, 'hu'), SHARE_PAGE_TEXT_DEFAULTS[key], `${key} has a Hungarian default`);
});

test('a wording written for the partner or the event replaces the dictionary text of the public page; the editor\'s own text still wins', () => {
  const texts = { 'sharePage.downloadButton': 'Letöltés' };
  assert.equal(sharePageText({}, 'downloadButton', 'en', texts), 'Letöltés');
  assert.equal(sharePageText({ texts: { downloadButton: 'Own' } }, 'downloadButton', 'en', texts), 'Own');
  assert.equal(sharePageText({}, 'downloadButton', 'en', null), SHARE_PAGE_TEXT_DEFAULTS.downloadButton);
});

test('the settings of a page that had the try-on switches are read without them (issue 557)', () => {
  const settings = normalizeEventSharePageSettings({
    includeOriginalCapture: true,
    includeCameraResult: false,
    includeTryOnResult: true,
    includeFramedTryOnResult: true,
    includeCheckedInTryOnResult: true,
    pendingTryOnMessage: 'Soon.',
    photoMode: 'approved_tryon_only',
    showCreateYourOwnButton: true,
    texts: { relatedPhotosTitle: 'Related', originalPhotoLabel: 'Original', downloadButton: 'Save' },
  });
  assert.deepEqual(settings, { showCreateYourOwnButton: true, texts: { downloadButton: 'Save' } });
  assert.deepEqual(normalizeEventSharePageSettings(null), DEFAULT_EVENT_SHARE_PAGE_SETTINGS);
});
