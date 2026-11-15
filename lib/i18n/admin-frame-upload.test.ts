import assert from 'node:assert/strict';
import test from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { adminOperationText } from './admin-operations';

const visibleCopy = [
  'Frame name users see in the chooser',
  'This is the chooser label, not the text printed on the photo.',
  'Upload a frame for this event',
  'Enter the chooser name, then optionally select an existing event message or add one here. You can adjust the message placement after upload.',
  'Message printed on this frame (optional)',
  'Choose an event message or add one now.',
  'Loading event messages…',
  'Messages could not be loaded',
  'You can still upload a frame without a message.',
  'Printed message',
  'No message on this frame',
  'Use existing: {message}',
  'Add a new message…',
  'New event message',
  'The message was saved and linked. Generate the default frame when you are ready to use it.',
  'The message was saved and linked, but its images could not be generated. Use Generate default frame to retry.',
  'Frame and message images are ready.',
  'Frame uploaded, but the message could not be attached. Open the event frame settings to attach it again.',
];

test('event-frame upload UI copy is translated in every registered admin locale', () => {
  for (const language of UI_LANGUAGES) {
    for (const source of visibleCopy) {
      const translated = adminOperationText(source, language);
      assert.ok(translated.trim(), `${language}: ${source}`);
      if (language !== 'en') assert.notEqual(translated, source, `${language}: English fallback for ${source}`);
    }
  }
  const existing = adminOperationText('Use existing: {message}', 'hu').replace('{message}', 'Hajrá!');
  assert.match(existing, /Hajrá!/);
});
