import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialUiLanguagesForPath } from './document-language';

test('localized capture and share documents use the selected device locale consistently', () => {
  assert.deepEqual(initialUiLanguagesForPath('/capture/event-1', 'hu', 'de'), {
    documentLanguage: 'hu',
    interfaceLanguage: 'hu',
  });
  assert.deepEqual(initialUiLanguagesForPath('/share/photo-token', 'ar', 'hu'), {
    documentLanguage: 'ar',
    interfaceLanguage: 'ar',
  });
});

test('capture/share use configured fallback and then English when device language is unavailable', () => {
  assert.deepEqual(initialUiLanguagesForPath('/capture/event-1', null, 'sr-Cyrl'), {
    documentLanguage: 'sr-Cyrl',
    interfaceLanguage: 'sr-Cyrl',
  });
  assert.deepEqual(initialUiLanguagesForPath('/share/photo-token', null), {
    documentLanguage: 'en',
    interfaceLanguage: 'en',
  });
});

test('admin pages use the interface locale for document metadata while other unlocalized routes remain English', () => {
  assert.deepEqual(initialUiLanguagesForPath('/admin/events/event-1/vetting', 'hu', 'de'), {
    documentLanguage: 'hu',
    interfaceLanguage: 'hu',
  });
  assert.deepEqual(initialUiLanguagesForPath('/', null), {
    documentLanguage: 'en',
    interfaceLanguage: 'en',
  });
});

test('admin pages use the saved user locale first, then device language, then English', () => {
  assert.deepEqual(initialUiLanguagesForPath('/admin/account', 'de', null, 'hu'), {
    documentLanguage: 'hu', interfaceLanguage: 'hu',
  });
  assert.deepEqual(initialUiLanguagesForPath('/admin/analytics', 'de'), {
    documentLanguage: 'de', interfaceLanguage: 'de',
  });
  assert.deepEqual(initialUiLanguagesForPath('/admin/analytics', null), {
    documentLanguage: 'en', interfaceLanguage: 'en',
  });
  assert.deepEqual(initialUiLanguagesForPath('/admin/login', 'de', null, 'hu'), {
    documentLanguage: 'en', interfaceLanguage: 'de',
  });
});
