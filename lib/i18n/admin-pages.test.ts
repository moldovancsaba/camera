import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { adminPageText } from '@/lib/i18n/admin-pages';

describe('admin page translations', () => {
  it('provides an analytics-load error message for every admin locale', () => {
    const source = 'The analytics report could not be loaded. Please try again.';
    for (const language of UI_LANGUAGES) {
      assert.ok(adminPageText(source, language).trim(), `Missing analytics error translation for ${language}`);
      if (language !== 'en') assert.notEqual(adminPageText(source, language), source, `English fallback used for ${language}`);
    }
  });

  it('provides accessible event status action labels and an error message for every admin locale', () => {
    for (const source of [
      'Activate event',
      'Deactivate event',
      'Could not update the event status. Please try again.',
    ]) {
      for (const language of UI_LANGUAGES) {
        const translated = adminPageText(source, language);
        assert.ok(translated.trim(), `Missing ${source} translation for ${language}`);
        if (language !== 'en') assert.notEqual(translated, source, `English fallback used for ${source} in ${language}`);
      }
    }
  });
});
