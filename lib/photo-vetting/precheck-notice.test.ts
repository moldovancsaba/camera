import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UI_LANGUAGES } from '@/lib/i18n';
import { photoPrecheckNotice } from './precheck-notice';

test('all precheck states let a human review continue and never present an AI decision', () => {
  assert.equal(photoPrecheckNotice(null), null);
  for (const status of ['queued', 'submitting', 'queued_remote', 'running'] as const) {
    const notice = photoPrecheckNotice({ status, flags: [] });
    assert.ok(notice?.message.includes('all decisions remain with the reviewer'));
  }
  const retrying = photoPrecheckNotice({ status: 'running', flags: [], errorCode: 'service_unavailable' });
  assert.equal(retrying?.title, 'Retrying');
  const failed = photoPrecheckNotice({ status: 'failed', flags: [] });
  assert.equal(failed?.title, 'AI content precheck unavailable');
  assert.equal(failed?.severity, 'warning');
  assert.ok(failed?.message.includes('all decisions remain with the reviewer'));
});

test('flagged and uncertain results show the signal and evidence, while clear results retain a human-review warning', () => {
  const flagged = photoPrecheckNotice({ status: 'completed', signal: 'flagged', flags: ['nudity'], evidence: 'Possible nudity' });
  assert.equal(flagged?.title, 'Needs review');
  assert.ok(flagged?.message.includes('Nudity'));
  assert.ok(flagged?.message.includes('Possible nudity'));
  assert.ok(flagged?.message.includes('all decisions remain with the reviewer'));

  const uncertain = photoPrecheckNotice({ status: 'completed', signal: 'uncertain', flags: [], evidence: 'Unclear image' });
  assert.equal(uncertain?.severity, 'warning');
  assert.ok(uncertain?.message.includes('Unclear image'));

  const clear = photoPrecheckNotice({ status: 'completed', signal: 'no_flags_detected', flags: [] });
  assert.ok(clear?.message.includes('No listed concern detected by the screening model'));
  assert.equal(clear?.severity, 'info');
});

test('precheck notices and category labels are available for every supported UI language', () => {
  for (const language of UI_LANGUAGES) {
    const unavailable = photoPrecheckNotice({ status: 'failed', flags: [] }, language);
    const flagged = photoPrecheckNotice({ status: 'completed', signal: 'flagged', flags: ['nudity', 'hateWords'] }, language);
    const clear = photoPrecheckNotice({ status: 'completed', signal: 'no_flags_detected', flags: [] }, language);
    assert.ok(unavailable?.title.trim(), `${language}: unavailable title`);
    assert.ok(unavailable?.message.trim(), `${language}: unavailable guidance`);
    assert.ok(flagged?.message.trim(), `${language}: category labels`);
    assert.ok(clear?.message.trim(), `${language}: clear result guidance`);
  }
});
