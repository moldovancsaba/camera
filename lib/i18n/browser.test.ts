import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserLanguage } from './browser';
import { en } from './messages.en';
import { DICTIONARIES } from './index';

test('the browser chooses the first supported preference and falls back to English only when none are supported', () => {
  assert.equal(browserLanguage(['hu-HU', 'en']), 'hu');
  assert.equal(browserLanguage(['HU']), 'hu');
  assert.equal(browserLanguage(['en-GB', 'hu']), 'en');
  assert.equal(browserLanguage(['xx', 'de-DE']), 'de');
  assert.equal(browserLanguage(['zh-TW']), 'zh-Hant');
  assert.equal(browserLanguage(['sr-Latn-RS']), 'sr-Latn');
  assert.equal(browserLanguage([]), 'en');
  assert.equal(browserLanguage(null), 'en');
  assert.equal(browserLanguage(undefined), 'en');
});

test('the error page is nonempty and preserves interpolation markers in every locale', () => {
  const keys = ['errorPage.title', 'errorPage.fallback', 'errorPage.tryAgain', 'errorPage.goHome', 'errorPage.errorId'] as const;
  const markers = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
  for (const key of keys) for (const [language, dictionary] of Object.entries(DICTIONARIES)) {
    assert.ok(dictionary[key].trim(), `${language} ${key} is nonempty`);
    assert.equal(markers(dictionary[key]), markers(en[key]), `${language} ${key} preserves markers`);
  }
});
