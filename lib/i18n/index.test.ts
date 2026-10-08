import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en } from './messages.en';
import { hu } from './messages.hu';
import { DEFAULT_UI_LANGUAGE, isUiLanguage, normalizeUiLanguage, textOr, translate, UI_LANGUAGES } from './index';

test('English is the default and anything that is not a known language is English', () => {
  assert.equal(DEFAULT_UI_LANGUAGE, 'en');
  for (const bad of [undefined, null, '', 'de', 'HU', 42, {}]) assert.equal(normalizeUiLanguage(bad), 'en', String(bad));
  assert.equal(normalizeUiLanguage('hu'), 'hu');
  assert.equal(isUiLanguage('hu'), true);
  assert.equal(isUiLanguage('de'), false);
});

test('every language has exactly the keys of the English dictionary, and no text is empty', () => {
  assert.deepEqual(Object.keys(hu).sort(), Object.keys(en).sort());
  for (const language of UI_LANGUAGES) for (const key of Object.keys(en) as Array<keyof typeof en>) assert.ok(translate(language, key).trim(), `${language} ${key}`);
});

test('a text is translated, and its {values} are filled in; a marker without a value stays', () => {
  assert.equal(translate('en', 'event.loading'), 'Loading event...');
  assert.equal(translate('hu', 'event.loading'), 'Esemény betöltése...');
  assert.equal(translate('en', 'event.notFound.text', { name: 'x' }), 'This event could not be loaded.');
});

test('every Hungarian text keeps the {markers} of its English text', () => {
  const markers = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const key of Object.keys(en) as Array<keyof typeof en>) assert.equal(markers(hu[key]), markers(en[key]), key);
});

test('an editor\'s own text wins; the English default stored by the page editor counts as not set in another language', () => {
  assert.equal(textOr('hu', 'event.loading', 'Töltés, egy pillanat...'), 'Töltés, egy pillanat...');
  assert.equal(textOr('hu', 'event.loading', 'Loading event...'), 'Esemény betöltése...', 'the stored English default is the dictionary\'s, not the editor\'s');
  assert.equal(textOr('hu', 'event.loading', '   '), 'Esemény betöltése...');
  assert.equal(textOr('hu', 'event.loading', undefined), 'Esemény betöltése...');
  assert.equal(textOr('en', 'event.loading', 'Loading event...'), 'Loading event...');
  assert.equal(textOr('en', 'event.loading', ''), 'Loading event...');
  assert.equal(textOr('en', 'event.loading', 'Hold on'), 'Hold on');
});
