import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTryOnPromptConfig, buildTryOnPromptSnapshot } from './prompts';

test('creates version one for a configured setup and preserves version for unchanged text', () => {
  const first = buildTryOnPromptConfig(' preserve the original shirt ', ' warped letters ');
  assert.equal(first.ok, true);
  if (!first.ok || !first.config) return;
  assert.deepEqual(first.config, { version: 1, positive: 'preserve the original shirt', negative: 'warped letters' });

  const same = buildTryOnPromptConfig(first.config.positive, first.config.negative, first.config);
  assert.deepEqual(same, { ok: true, config: first.config });
});

test('increments prompt version only when content changes', () => {
  const result = buildTryOnPromptConfig('updated prompt', '', { version: 3, positive: 'old prompt', negative: '' });
  assert.deepEqual(result, { ok: true, config: { version: 4, positive: 'updated prompt', negative: '' } });
});

test('rejects blank positive text when negative text is supplied', () => {
  assert.deepEqual(buildTryOnPromptConfig('', 'avoid distortion'), { ok: false, code: 'negative_without_positive' });
});

test('rejects control characters and oversized text', () => {
  assert.deepEqual(buildTryOnPromptConfig('bad\u0000prompt', ''), { ok: false, code: 'invalid_positive_prompt' });
  assert.deepEqual(buildTryOnPromptConfig('x'.repeat(6001), ''), { ok: false, code: 'invalid_positive_prompt' });
  assert.deepEqual(buildTryOnPromptConfig('valid', 'x'.repeat(4001)), { ok: false, code: 'invalid_negative_prompt' });
});

test('snapshots are immutable hashes of exact prompt, version, source and actor metadata', () => {
  const first = buildTryOnPromptSnapshot({
    setupId: 'event-a-jersey',
    version: 2,
    positive: 'Keep the jersey unchanged.',
    negative: 'Do not alter logo text.',
    source: 'setup',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const same = buildTryOnPromptSnapshot({
    setupId: 'event-a-jersey',
    version: 2,
    positive: 'Keep the jersey unchanged.',
    negative: 'Do not alter logo text.',
    source: 'setup',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(same.ok, true);
  if (same.ok) assert.equal(same.snapshot.sha256, first.snapshot.sha256);
  const edited = buildTryOnPromptSnapshot({
    setupId: 'event-a-jersey',
    version: 3,
    positive: 'Keep the jersey unchanged. Preserve its folds.',
    negative: 'Do not alter logo text.',
    source: 'setup',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  assert.equal(edited.ok, true);
  if (edited.ok) assert.notEqual(edited.snapshot.sha256, first.snapshot.sha256);
});
