import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('server-only', { exports: {} });
const { CameraModerationClient, DEFAULT_MODERATION_BASE_URL, isCameraPendingPhotoUrl, moderationConfiguration } = await import('./client');

const apiKey = 'test-only-camera-service-key';

test('requires a server-only HTTPS v1 endpoint and Camera service key', () => {
  assert.equal(moderationConfiguration({ CAMERA_MODERATION_API_KEY: '' }), null);
  assert.equal(moderationConfiguration({ CAMERA_MODERATION_API_KEY: apiKey, CAMERA_MODERATION_BASE_URL: 'http://localhost/v1' }), null);
  assert.equal(moderationConfiguration({ CAMERA_MODERATION_API_KEY: apiKey, CAMERA_MODERATION_BASE_URL: 'https://service.test/v2' }), null);
  assert.equal(moderationConfiguration({ CAMERA_MODERATION_API_KEY: apiKey, CAMERA_MODERATION_BASE_URL: 'https://attacker.example/v1' }), null, 'the bearer key cannot be redirected to another HTTPS host');
  assert.equal(moderationConfiguration({ CAMERA_MODERATION_API_KEY: apiKey, CAMERA_MODERATION_BASE_URL: 'https://chatbotapi.haho.ai/v1/moderation' }), null, 'legacy moderation-only routes are not the shared job API');
  assert.deepEqual(moderationConfiguration({ CAMERA_MODERATION_API_KEY: apiKey }), { baseUrl: DEFAULT_MODERATION_BASE_URL, apiKey });
});

test('discovers the moderation job and a selectable model before using auto, then submits and polls one job', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/job-types')) return new Response(JSON.stringify({ job_types: { image_moderation: { enabled: true } } }), { status: 200 });
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'candidate', selectable_for: ['image_moderation'], default_for: ['image_moderation'] }], defaults: { image_moderation: 'candidate' } }), { status: 200 });
    if (url.endsWith('/jobs') && init?.method === 'POST') return new Response(JSON.stringify({ id: 'job-1' }), { status: 202 });
    if (url.endsWith('/jobs/job-1') && init?.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ id: 'job-1', status: 'running' }), { status: 200 });
  };
  const client = new CameraModerationClient({ baseUrl: DEFAULT_MODERATION_BASE_URL, apiKey }, fetcher, 'test');
  await client.discover();
  const jobId = await client.submit(Buffer.from('image bytes'), 'camera-idempotency-1');
  const job = await client.read(jobId);
  await client.delete(jobId);

  assert.equal(jobId, 'job-1');
  assert.equal(job.status, 'running');
  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), ['/v1/job-types', '/v1/models', '/v1/jobs', '/v1/jobs/job-1', '/v1/jobs/job-1']);
  const submission = calls[2]!;
  assert.equal(new Headers(submission.init?.headers).get('authorization'), `Bearer ${apiKey}`);
  assert.equal(new Headers(submission.init?.headers).get('X-Request-Purpose'), 'test');
  assert.equal(new Headers(submission.init?.headers).get('Idempotency-Key'), 'camera-idempotency-1');
  assert.deepEqual(JSON.parse(String(submission.init?.body)), {
    task: 'image_moderation',
    model: 'auto',
    input: { image_base64: Buffer.from('image bytes').toString('base64') },
  });
  for (const call of calls) {
    assert.equal(new Headers(call.init?.headers).get('authorization'), `Bearer ${apiKey}`);
    assert.equal(new Headers(call.init?.headers).get('X-Request-Purpose'), 'test');
  }
  assert.equal(calls[4]!.init?.method, 'DELETE');
});

test('treats an already expired remote result as successfully cleaned up', async () => {
  const client = new CameraModerationClient({ baseUrl: DEFAULT_MODERATION_BASE_URL, apiKey }, async () => new Response(null, { status: 404 }));
  await assert.doesNotReject(client.delete('expired-job'));
});

test('refuses submission when the task is not permitted or no model is selectable', async () => {
  const notAllowed = new CameraModerationClient({ baseUrl: DEFAULT_MODERATION_BASE_URL, apiKey }, async () => new Response(JSON.stringify({ job_types: {} }), { status: 200 }));
  await assert.rejects(notAllowed.discover(), /image_moderation_not_permitted/);

  let count = 0;
  const noModel = new CameraModerationClient({ baseUrl: DEFAULT_MODERATION_BASE_URL, apiKey }, async () => {
    count += 1;
    return new Response(JSON.stringify(count === 1
      ? { job_types: { image_moderation: { enabled: true } } }
      : { data: [{ id: 'text-only', selectable_for: ['text'] }] }), { status: 200 });
  });
  await assert.rejects(noModel.discover(), /no_moderation_model_selectable/);
});

test('restricts sources to the event-scoped pending path in Camera Blob', () => {
  const token = 'vercel_blob_rw_teststore_secret';
  const eventId = '6ac636415fa8994cb2d3df85';
  const valid = `https://teststore.public.blob.vercel-storage.com/pending/${eventId}/0123456789abcdef01234567-shot.jpg`;
  assert.equal(isCameraPendingPhotoUrl(valid, eventId, token), true);
  assert.equal(isCameraPendingPhotoUrl('https://attacker.test/pending/photo.jpg', eventId, token), false);
  assert.equal(isCameraPendingPhotoUrl(valid, 'another-event', token), false);
});
