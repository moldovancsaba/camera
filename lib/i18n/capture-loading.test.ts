import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLoadingText } from '@/lib/i18n/capture-loading';

test('capture loading is independent from event-flow loading wording', () => {
  assert.equal(captureLoadingText('hu', 'Régi érték', { 'capture.loading': 'Töltődünk…', 'event.loading': 'Egy pillanat…' }), 'Töltődünk…');
  assert.equal(captureLoadingText('hu', 'Régi érték', { 'event.loading': 'Egy pillanat…' }), 'Régi érték');
});

test('capture loading retains a custom legacy event text when no text-level wording exists', () => {
  assert.equal(captureLoadingText('hu', 'Töltődünk…', {}), 'Töltődünk…');
});

test('capture loading translates the legacy English default for Hungarian when no custom wording exists', () => {
  assert.equal(captureLoadingText('hu', 'Loading…', {}), 'Töltődünk…');
});

test('capture loading falls back to the language dictionary when no legacy text exists', () => {
  assert.equal(captureLoadingText('hu', undefined, {}), 'Töltődünk…');
  assert.equal(captureLoadingText('en', undefined, {}), 'Loading…');
});
