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

test('unlocalized routes keep truthful English document metadata while localized regions get device locale', () => {
  assert.deepEqual(initialUiLanguagesForPath('/admin/events/event-1/vetting', 'hu', 'de'), {
    documentLanguage: 'en',
    interfaceLanguage: 'hu',
  });
  assert.deepEqual(initialUiLanguagesForPath('/', null), {
    documentLanguage: 'en',
    interfaceLanguage: 'en',
  });
});
