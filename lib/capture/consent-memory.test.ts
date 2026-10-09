import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConsentRecord } from '@/lib/events/consent';
import { CONSENT_MEMORY_MAX_AGE_MS, forgetConsents, recallConsents, rememberConsents } from './consent-memory';

function fakeStorage() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}
const record = (text: string): ConsentRecord => ({ pageId: 'p1', pageType: 'accept', checkboxText: text, accepted: true, acceptedAt: '2026-10-09T20:00:00.000Z', linkUrl: 'https://example.test/terms' });

test('what was accepted before a sign-in is there after it, for the same event only', () => {
  const s = fakeStorage();
  rememberConsents(s, 'e1', [record('terms'), record('privacy')], 1_000);
  assert.deepEqual(recallConsents(s, 'e1', 60_000).map((r) => r.checkboxText), ['terms', 'privacy']);
  assert.deepEqual(recallConsents(s, 'e2', 60_000), [], 'another event never sees it');
});

test('an acceptance older than half an hour, or from the future, or damaged, is not used', () => {
  const s = fakeStorage();
  rememberConsents(s, 'e1', [record('terms')], 1_000);
  assert.deepEqual(recallConsents(s, 'e1', 1_000 + CONSENT_MEMORY_MAX_AGE_MS + 1), []);
  assert.deepEqual(recallConsents(s, 'e1', 500), []);
  s.data.set('camera.consents.e1', '{not json');
  assert.deepEqual(recallConsents(s, 'e1', 2_000), []);
  s.data.set('camera.consents.e1', JSON.stringify({ savedAt: 1_000, consents: [record('ok'), { pageId: 1 }, { ...record('no'), accepted: false }] }));
  assert.deepEqual(recallConsents(s, 'e1', 2_000).map((r) => r.checkboxText), ['ok'], 'only well-formed, accepted records');
});

test('an empty list and forgetting remove the memory; a missing or throwing storage remembers nothing and never throws', () => {
  const s = fakeStorage();
  rememberConsents(s, 'e1', [record('terms')], 1_000);
  rememberConsents(s, 'e1', [], 1_001);
  assert.equal(s.data.size, 0);
  rememberConsents(s, 'e1', [record('terms')], 1_000);
  forgetConsents(s, 'e1');
  assert.equal(s.data.size, 0);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  rememberConsents(broken, 'e1', [record('terms')]);
  assert.deepEqual(recallConsents(broken, 'e1'), []);
  forgetConsents(broken, 'e1');
  rememberConsents(null, 'e1', [record('terms')]);
  assert.deepEqual(recallConsents(undefined, 'e1'), []);
});
