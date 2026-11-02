import assert from 'node:assert/strict';
import test from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { adminOperationText, hasAdminOperationTranslation } from './admin-operations';

const visibleCopy = [
  'The image shown here is generated from the event’s default slideshow. Choose or upload a different image to change only this welcome page; open Event Slideshows to change its source.',
  'No generated image is available yet. Choose or upload an image for this welcome page, or open Event Slideshows to set up the default slideshow.',
  'Choose or upload a different image',
  'Open Event Slideshows',
  'Welcome page image',
  'Choose an event or partner image, upload a new image to this event’s Images library, or enter an HTTPS address.',
  'Keep the current slideshow image',
  'Use this image address',
  'Cancel image replacement',
];

test('welcome image replacement guidance is translated in every admin locale', () => {
  for (const language of UI_LANGUAGES) {
    for (const source of visibleCopy) {
      const localized = adminOperationText(source, language);
      assert.ok(localized.trim(), `${language}: ${source}`);
      assert.equal(hasAdminOperationTranslation(source), true, source);
      if (language !== 'en') assert.notEqual(localized, source, `${language}: English fallback for ${source}`);
    }
  }
});
