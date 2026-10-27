import assert from 'node:assert/strict';
import { test } from 'node:test';
import { photoPrecheckNotice } from './precheck-notice';

test('all precheck states let a human review continue and never present an AI decision', () => {
  assert.equal(photoPrecheckNotice(null), null);
  for (const status of ['queued', 'submitting', 'queued_remote', 'running'] as const) {
    const notice = photoPrecheckNotice({ status, flags: [] });
    assert.ok(notice?.message.includes('human review'));
    assert.ok(notice?.message.includes('will not decide'));
  }
  const retrying = photoPrecheckNotice({ status: 'running', flags: [], errorCode: 'service_unavailable' });
  assert.equal(retrying?.title, 'AI content precheck is retrying');
  const failed = photoPrecheckNotice({ status: 'failed', flags: [] });
  assert.equal(failed?.severity, 'warning');
  assert.ok(failed?.message.includes('manually'));
});

test('flagged and uncertain results show the signal and evidence, while clear results retain a human-review warning', () => {
  const flagged = photoPrecheckNotice({ status: 'completed', signal: 'flagged', flags: ['nudity'], evidence: 'Possible nudity' });
  assert.equal(flagged?.title, 'Possible content concern');
  assert.ok(flagged?.message.includes('nudity'));
  assert.ok(flagged?.message.includes('Possible nudity'));
  assert.ok(flagged?.message.includes('Review every photo yourself'));

  const uncertain = photoPrecheckNotice({ status: 'completed', signal: 'uncertain', flags: [], evidence: 'Unclear image' });
  assert.equal(uncertain?.severity, 'warning');
  assert.ok(uncertain?.message.includes('Unclear image'));

  const clear = photoPrecheckNotice({ status: 'completed', signal: 'no_flags_detected', flags: [] });
  assert.ok(clear?.message.includes('does not establish that the photo is safe'));
  assert.equal(clear?.severity, 'info');
});
