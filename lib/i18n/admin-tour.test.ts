import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { ADMIN_TOUR_ENGLISH_TEXTS, adminTourText } from './admin-tour';

test('admin tour descriptions have a non-English draft for every registered locale', () => {
  for (const language of UI_LANGUAGES) {
    for (const source of ADMIN_TOUR_ENGLISH_TEXTS) {
      assert.ok(adminTourText(source, language).trim(), `${language}: ${source}`);
      if (language !== 'en') assert.notEqual(adminTourText(source, language), source, `${language} uses a draft translation for ${source}`);
    }
  }
});
