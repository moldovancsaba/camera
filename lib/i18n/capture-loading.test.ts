import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLoadingText } from '@/lib/i18n/capture-loading';

test('capture loading uses the event or partner wording ahead of the legacy event field', () => {
  assert.equal(captureLoadingText('hu', 'Töltődünk…', { 'event.loading': 'Egy pillanat…' }), 'Egy pillanat…');
});

test('capture loading retains a custom legacy event text when no text-level wording exists', () => {
  assert.equal(captureLoadingText('hu', 'Töltődünk…', {}), 'Töltődünk…');
});

test('capture loading translates the legacy English default for Hungarian when no custom wording exists', () => {
  assert.equal(captureLoadingText('hu', 'Loading event...', {}), 'Esemény betöltése...');
});

test('capture loading falls back to the language dictionary when no legacy text exists', () => {
  assert.equal(captureLoadingText('hu', undefined, {}), 'Esemény betöltése...');
  assert.equal(captureLoadingText('en', undefined, {}), 'Loading event...');
});
