import assert from 'node:assert/strict';
import test from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { adminExperienceTemplateText } from './admin-experience-templates';
import JOURNEY_UI_TRANSLATIONS from './admin-experience-template-translations.json';

const LIVE_JOURNEY_COPY = [
  'Live guest flow',
  'Saving edits to this selected journey updates the live guest flow, including children that still follow it.',
] as const;

test('live journey impact warning is translated for every admin locale', () => {
  for (const language of UI_LANGUAGES) {
    for (const source of LIVE_JOURNEY_COPY) {
      const translation = adminExperienceTemplateText(source, language);
      assert.ok(translation, `${language} is missing ${source}`);
      if (language !== 'en') assert.notEqual(translation, source, `${language} fell back to English for ${source}`);
    }
  }
});

test('every journey management phrase has a translation in every admin locale', () => {
  for (const [source, translations] of Object.entries(JOURNEY_UI_TRANSLATIONS)) {
    for (const language of UI_LANGUAGES) {
      const translation = translations[language];
      assert.ok(translation, `${language} is missing ${source}`);
      if (language !== 'en') assert.notEqual(translation, source, `${language} fell back to English for ${source}`);
      assert.equal(adminExperienceTemplateText(source, language), translation);
    }
  }
});
