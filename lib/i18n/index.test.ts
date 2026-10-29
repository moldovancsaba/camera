import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en } from './messages.en';
import { DEFAULT_UI_LANGUAGE, DICTIONARIES, isUiLanguage, normalizeUiLanguage, textOr, translate, UI_LANGUAGES, uiLanguageOptionLabel } from './index';

test('English is the default and anything that is not a known language is English', () => {
  assert.equal(DEFAULT_UI_LANGUAGE, 'en');
  for (const bad of [undefined, null, '', 'HU', 42, {}]) assert.equal(normalizeUiLanguage(bad), 'en', String(bad));
  assert.equal(normalizeUiLanguage('de'), 'de');
  assert.equal(normalizeUiLanguage('hu'), 'hu');
  assert.equal(isUiLanguage('hu'), true);
  assert.equal(isUiLanguage('de'), true);
});

test('every language has exactly the keys of the English dictionary, and no text is empty', () => {
  for (const language of UI_LANGUAGES) assert.deepEqual(Object.keys(DICTIONARIES[language]).sort(), Object.keys(en).sort(), language);
  for (const language of UI_LANGUAGES) for (const key of Object.keys(en) as Array<keyof typeof en>) assert.ok(translate(language, key).trim(), `${language} ${key}`);
});

test('language selectors show native and English names for all supported locales', () => {
  assert.equal(uiLanguageOptionLabel('en'), 'English');
  assert.equal(uiLanguageOptionLabel('hu'), 'Magyar (Hungarian)');
  assert.equal(uiLanguageOptionLabel('zh-Hant'), '繁體中文 (Traditional Chinese)');
  for (const language of UI_LANGUAGES) assert.ok(uiLanguageOptionLabel(language).includes('(') || language === 'en', language);
});

test('a text is translated, and its {values} are filled in; a marker without a value stays', () => {
  assert.equal(translate('en', 'event.loading'), 'Loading event...');
  assert.equal(translate('hu', 'event.loading'), 'Esemény betöltése...');
  assert.equal(translate('en', 'event.notFound.text', { name: 'x' }), 'This event could not be loaded.');
});

test('every locale text keeps the {markers} of its English text', () => {
  const markers = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const language of UI_LANGUAGES) for (const key of Object.keys(en) as Array<keyof typeof en>) {
    assert.equal(markers(DICTIONARIES[language][key]), markers(en[key]), `${language} ${key}`);
  }
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

test('several English wordings of one field are all treated as the stored default; the first key is the text shown', () => {
  const keys = ['login.nameLabel', 'login.nameLabelEditor'] as const;
  assert.equal(textOr('hu', keys, 'Your name'), 'A neved');
  assert.equal(textOr('hu', keys, 'Your Name'), 'A neved');
  assert.equal(textOr('hu', keys, 'Becenév'), 'Becenév');
  assert.equal(textOr('en', keys, 'Your Name'), 'Your Name');
});
