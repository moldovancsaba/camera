import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendSubmissionConsents } from './submit-consents';

const consents = [{ pageId: 'accept-1', pageType: 'accept' as const, checkboxText: 'I agree', accepted: true as const, acceptedAt: '2026-10-15T06:00:00.000Z' }];

test('remembered login consent is appended to the saved photo before the journey advances', async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const ok = await appendSubmissionConsents(async (input, init) => {
    calls.push({ input, init });
    return new Response(null, { status: 200 });
  }, 'submission-1', consents);

  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, '/api/submissions/submission-1');
  assert.equal(calls[0].init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { action: 'append_consents', consents });
});

test('empty remembered consent does not make a request, and a failed write is reported', async () => {
  let requests = 0;
  const fetcher = async () => { requests += 1; return new Response(null, { status: 500 }); };
  assert.equal(await appendSubmissionConsents(fetcher, 'submission-1', []), true);
  assert.equal(requests, 0);
  assert.equal(await appendSubmissionConsents(fetcher, 'submission-1', consents), false);
  assert.equal(requests, 1);
  assert.equal(await appendSubmissionConsents(async () => { throw new Error('offline'); }, 'submission-1', consents), false);
});
