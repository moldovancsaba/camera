import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { ADMIN_ACCOUNT_ENGLISH_TEXTS, adminAccountText } from './admin-account';

test('account settings copy exists for every registered locale', () => {
  for (const language of UI_LANGUAGES) {
    for (const key of ADMIN_ACCOUNT_ENGLISH_TEXTS) {
      assert.ok(adminAccountText(key, language).trim(), `${language}: ${key}`);
    }
  }
});
