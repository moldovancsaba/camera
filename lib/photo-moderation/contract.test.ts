import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODERATION_CATEGORIES, parseCameraModerationResult } from './contract';

function result(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 'camera-moderation.v1',
    model: 'moderation-model',
    review_required: true,
    automated_decision: 'none',
    signal: 'no_flags_detected',
    flags: [],
    categories: Object.fromEntries(MODERATION_CATEGORIES.map((category) => [category, 'not_detected'])),
    evidence: '',
    limitations: 'Experimental screening; a human must decide.',
    ...overrides,
  };
}

test('accepts a complete clear result only as a human-review signal', () => {
  const parsed = parseCameraModerationResult(result());
  assert.equal(parsed?.signal, 'no_flags_detected');
  assert.equal(parsed?.automated_decision, 'none');
  assert.deepEqual(Object.keys(parsed?.categories ?? {}).sort(), [...MODERATION_CATEGORIES].sort());
});

test('accepts detected categories only when flags and aggregate signal agree', () => {
  const categories = Object.fromEntries(MODERATION_CATEGORIES.map((category) => [category, category === 'nudity' ? 'detected' : 'not_detected']));
  const parsed = parseCameraModerationResult(result({ categories, flags: ['nudity'], signal: 'flagged' }));
  assert.deepEqual(parsed?.flags, ['nudity']);
  assert.equal(parseCameraModerationResult(result({ categories, flags: [], signal: 'flagged' })), null);
});

test('rejects incomplete, inconsistent, or decision-bearing results', () => {
  const incomplete = result({ categories: { nudity: 'not_detected' } });
  const decision = result({ automated_decision: 'approve' });
  const inconsistent = result({ signal: 'uncertain', categories: Object.fromEntries(MODERATION_CATEGORIES.map((category) => [category, 'not_detected'])) });
  assert.equal(parseCameraModerationResult(incomplete), null);
  assert.equal(parseCameraModerationResult(decision), null);
  assert.equal(parseCameraModerationResult(inconsistent), null);
});
