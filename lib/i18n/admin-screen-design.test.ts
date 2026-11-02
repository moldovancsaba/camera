import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { adminScreenDesignText } from './admin-screen-design';

test('slideshow layer controls and overlay guidance are translated for every supported admin locale', () => {
  const sources = [
    'Show overlay picture',
    'Show QR code',
    'Show text',
    'Leave empty to skip the overlay image. QR and text layers can still show.',
    'A 16:9 picture (1920×1080), transparent where photos play.',
    "Upload to the partner's Images library.",
    "Upload to the event's Images library.",
    'Choose from available Images libraries or paste an HTTPS address.',
    'PNG, WebP or SVG can be transparent; JPEG cannot.',
  ];
  for (const language of UI_LANGUAGES) {
    for (const source of sources) {
      const translated = adminScreenDesignText(source, language);
      assert.ok(translated.trim(), `${language} has a translation for ${source}`);
      if (language !== 'en') assert.notEqual(translated, source, `${language} does not silently fall back to English for ${source}`);
    }
  }
});
