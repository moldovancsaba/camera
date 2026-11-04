import assert from 'node:assert/strict';
import test from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { adminJourneyPublicationText } from './admin-journey-publication';

const labels = [
  'Journey shown to event guests',
  'This choice controls the journey opened by this event’s capture URL, short link and QR codes.',
  'Currently live',
  'This event’s own pages',
  'The public event links now use this journey.',
  'Open capture journey',
  'Short link',
  'Create journey version',
  'Journey version created',
  'Select this version and save to make it the default at this level.',
  'Use this event’s own pages',
  'Public event links',
];

test('journey publication controls have a non-empty translation for every admin UI language', () => {
  for (const language of UI_LANGUAGES) {
    for (const label of labels) {
      const translated = adminJourneyPublicationText(label, language);
      assert.ok(translated?.trim(), `${language}: ${label}`);
      if (language !== 'en') assert.notEqual(translated, label, `${language}: untranslated ${label}`);
    }
  }
});
