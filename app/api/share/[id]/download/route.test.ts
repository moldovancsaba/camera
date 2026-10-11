import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

type RouteModule = typeof import('./route');
const importRoute = (caseId: string) => import('./route?case=' + caseId) as Promise<RouteModule>;

const id = new ObjectId().toHexString();
const request = () => new NextRequest(`http://localhost/api/share/${id}/download?variant=${id}:camera-result`);
const ctx = { params: Promise.resolve({ id }) };

function setup(t: import('node:test').TestContext) {
  const state: { doc: Record<string, unknown> | null } = { doc: null };
  t.mock.module('@/lib/db/mongodb', {
    exports: {
      connectToDatabase: async () => ({
        collection: () => ({ findOne: async () => state.doc, find: () => ({ toArray: async () => [], sort: () => ({ toArray: async () => [] }) }) }),
      }),
    },
  });
  return state;
}

const photo = (over: Record<string, unknown> = {}) => ({ _id: new ObjectId(id), submissionKind: 'original', imageUrl: 'https://example.public.blob.vercel-storage.com/p.jpg', eventId: 'evt-1', eventIds: ['evt-1'], ...over });

test('a photo that is not public cannot be downloaded: the answer is the same as for an unknown id', async (t) => {
  const state = setup(t);
  const { GET } = await importRoute('hidden');
  const cases: Array<[string, Record<string, unknown> | null]> = [
    ['pending', photo({ reviewStatus: 'pending_review' })],
    ['rejected', photo({ reviewStatus: 'rejected' })],
    ['archived', photo({ isArchived: true })],
    ['hidden', photo({ hiddenFromEvents: ['evt-1'] })],
    ['unknown', null],
  ];
  for (const [name, doc] of cases) {
    state.doc = doc;
    const res = await GET(request(), ctx);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    assert.equal(res.status, 404, name);
    assert.equal(body.error, 'Share submission not found', name);
  }
});

test('a public photo is not refused by the rule (approved, legacy without a status)', async (t) => {
  const state = setup(t);
  const { GET } = await importRoute('public');
  for (const [name, doc] of [['approved', photo({ reviewStatus: 'approved' })], ['legacy', photo()]] as const) {
    state.doc = doc;
    const res = await GET(request(), ctx);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    assert.notEqual(body.error, 'Share submission not found', name);
  }
});

test('a stored try-on result is never downloadable, approved and shared or not: the answer is the same as for an unknown id (issue 557)', async (t) => {
  const state = setup(t);
  const { GET } = await importRoute('tryon');
  for (const over of [
    { reviewStatus: 'approved', isShareVisible: true },
    { reviewStatus: 'approved' },
    { reviewStatus: 'pending_review' },
    {},
  ]) {
    state.doc = photo({ submissionKind: 'tryon_result', sourceSubmissionId: 'src-1', ...over });
    const res = await GET(request(), ctx);
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    assert.equal(res.status, 404, JSON.stringify(over));
    assert.equal(body.error, 'Share submission not found', JSON.stringify(over));
  }
});

test('the photo is offered as <id>:camera-result and nothing else is downloadable', async (t) => {
  const state = setup(t);
  state.doc = photo({ reviewStatus: 'approved' });
  const fetched: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
    fetched.push(String(url));
    return new Response('jpeg-bytes', { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '10' } });
  });
  const { GET } = await importRoute('variant');
  const ok = await GET(request(), ctx);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Content-Type'), 'image/jpeg');
  assert.match(ok.headers.get('Content-Disposition') ?? '', /attachment; filename="[0-9a-f]{24}-camera-result\.jpg"/);
  assert.deepEqual(fetched, ['https://example.public.blob.vercel-storage.com/p.jpg']);

  for (const variant of [`${id}:tryon-result`, `${id}:tryon-framed`, `${id}:original-capture`, 'other:camera-result']) {
    const res = await GET(new NextRequest(`http://localhost/api/share/${id}/download?variant=${encodeURIComponent(variant)}`), ctx);
    assert.equal(res.status, 404, variant);
    assert.equal(((await res.json()) as { error?: string }).error, 'No downloadable image available', variant);
  }
  assert.equal(fetched.length, 1, 'nothing else was fetched');
  assert.equal((await GET(new NextRequest(`http://localhost/api/share/${id}/download`), ctx)).status, 400, 'a variant is required');
});

// The anonymous journey recording (issue 521, phase 2): a download by a person is counted for the photo's event, after the answer; a crawler's is not; the download itself is unchanged.
function spyOnRecording(t: import('node:test').TestContext): Array<{ event: unknown; name: unknown }> {
  const records: Array<{ event: unknown; name: unknown }> = [];
  t.mock.module('@/lib/journey/store', { exports: { recordServerJourney: async (_db: unknown, event: unknown, name: unknown) => { records.push({ event, name }); } } });
  t.mock.module('@/lib/api/run-after-response', { exports: { runAfterResponse: (task: () => Promise<void>) => { void task(); } } });
  return records;
}

test('a download by a person is recorded once, for the event of the photo, and the download is still offered', async (t) => {
  const state = setup(t);
  const records = spyOnRecording(t);
  state.doc = photo({ reviewStatus: 'approved' });
  const { GET } = await importRoute('journey-download');
  const res = await GET(new NextRequest(`http://localhost/api/share/${id}/download?variant=${id}:camera-result`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1' } }), ctx);
  assert.notEqual(res.status, 404);
  assert.deepEqual(records, [{ event: 'evt-1', name: 'download' }]);
});

test('a crawler, a prefetch and a request with no user agent are not downloads', async (t) => {
  const state = setup(t);
  const records = spyOnRecording(t);
  state.doc = photo({ reviewStatus: 'approved' });
  const { GET } = await importRoute('journey-crawler');
  for (const headers of [{ 'user-agent': 'facebookexternalhit/1.1' }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }, { 'user-agent': 'Mozilla/5.0 (iPhone)', purpose: 'prefetch' }, {}] as Array<Record<string, string>>) {
    await GET(new NextRequest(`http://localhost/api/share/${id}/download?variant=${id}:camera-result`, { headers }), ctx);
  }
  assert.deepEqual(records, []);
});

test('a photo that is not public is not counted as downloaded: it is refused before anything is recorded', async (t) => {
  const state = setup(t);
  const records = spyOnRecording(t);
  state.doc = photo({ reviewStatus: 'pending_review' });
  const { GET } = await importRoute('journey-hidden');
  const res = await GET(new NextRequest(`http://localhost/api/share/${id}/download?variant=${id}:camera-result`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } }), ctx);
  assert.equal(res.status, 404);
  assert.deepEqual(records, []);
});
