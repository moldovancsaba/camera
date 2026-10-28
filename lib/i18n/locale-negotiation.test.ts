import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceUiLanguage, parseAcceptLanguage, resolveUiLanguage } from './locale-negotiation';

test('Accept-Language honors quality and stable order while ignoring wildcard and q=0 entries', () => {
  assert.deepEqual(parseAcceptLanguage('fr-CA;q=0.5, en-GB;q=0.9, hu-HU;q=0.9, *;q=0.8, de;q=0'), ['en-GB', 'hu-HU', 'fr-CA']);
  assert.deepEqual(parseAcceptLanguage(null), []);
});

test('malformed or repeated quality parameters cannot become top-priority preferences', () => {
  assert.deepEqual(parseAcceptLanguage('de;q=0.2, fr;q=bogus, it;q=0.8;q=1, hu;q=0.7'), ['hu', 'de']);
});

test('device matching respects language, region, and writing system', () => {
  assert.equal(deviceUiLanguage(['de-AT', 'hu-HU']), 'de');
  assert.equal(deviceUiLanguage(['zh-TW']), 'zh-Hant');
  assert.equal(deviceUiLanguage(['zh-CN']), 'zh-Hans');
  assert.equal(deviceUiLanguage(['sr-Latn-RS']), 'sr-Latn');
  assert.equal(deviceUiLanguage(['sr-Cyrl-RS']), 'sr-Cyrl');
  assert.equal(deviceUiLanguage(['pt-PT']), 'pt-PT');
  assert.equal(deviceUiLanguage(['pt-BR']), 'pt-BR');
  assert.equal(deviceUiLanguage(['not-a-locale']), null);
});

test('device language wins; partner language is the first configured fallback and event language the secondary fallback', () => {
  assert.equal(resolveUiLanguage(['de-DE'], 'hu', 'it'), 'de');
  assert.equal(resolveUiLanguage(['xx'], 'hu', 'it'), 'it');
  assert.equal(resolveUiLanguage(['xx'], 'hu', null), 'hu');
  assert.equal(resolveUiLanguage(['xx'], null, null), 'en');
});
