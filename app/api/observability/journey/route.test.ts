import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { JOURNEY_MAX_BYTES } from '@/lib/journey/events';
import { JOURNEY_SETTING_ID, resetJourneySettingCache } from '@/lib/journey/setting';
import { resetJourneyEventCache, resetJourneyIndexCheck } from '@/lib/journey/store';

const MONGO_ID = new ObjectId().toString();
const UUID = 'b3a2c0de-1111-4222-8333-944455556666';
const SESSION = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
let ipCounter = 0;

type RouteModule = typeof import('./route');
const load = (id: string) => import('./route?case=' + id) as Promise<RouteModule>;

function request(body: string, headers: Record<string, string> = {}, ip?: string): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/observability/journey', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `198.51.100.${ipCounter}`, ...headers } });
}
const batch = (ev: unknown[], event = MONGO_ID) => JSON.stringify({ v: 1, s: SESSION, e: event, ev });

function setup(t: TestContext, options: { off?: boolean; hang?: boolean } = {}) {
  resetJourneySettingCache();
  resetJourneyEventCache();
  resetJourneyIndexCheck();
  const seeded = fakeDb({ events: [{ _id: new ObjectId(MONGO_ID), eventId: UUID }], ...(options.off ? { admin_settings: [{ settingId: JOURNEY_SETTING_ID, enabled: false }] } : {}) });
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: options.hang ? () => new Promise(() => undefined) : async () => seeded.db } });
  return seeded;
}

/** The write runs after the answer; wait until it has happened (or give up). */
async function settled(check: () => boolean): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return check();
}

test('a valid batch answers 204 and is stored: the counts of the event, by UTC day, and one row per record', async (t) => {
  const w = setup(t);
  const { POST } = await load('valid');
  const response = await POST(request(batch([['journey.start', null, 0], ['step.reach', 'camera', 1500], ['photo.taken', 'system', 5200]]), { 'user-agent': IPHONE }));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.ok(await settled(() => w.data.journey_daily?.length === 3));
  assert.deepEqual(w.data.journey_daily.map((r) => `${r.name}:${r.key}`).sort(), ['journey.start:ios', 'photo.taken:system', 'step.reach:camera']);
  assert.ok(w.data.journey_daily.every((r) => r.eventId === UUID), 'filed under the UUID of the event, though the page named it by its Mongo id');
  assert.equal(w.data.journey_events.length, 3);
});

test('NEVER stored: the IP address, the user agent, a cookie, a header, a name, an e-mail, whatever the request carried', async (t) => {
  const w = setup(t);
  const { POST } = await load('forbidden');
  const response = await POST(request(batch([['journey.start', 'Mozilla/5.0 person@example.test', 0], ['step.reach', 'who-are-you', 100]]), {
    'user-agent': IPHONE,
    'x-forwarded-for': '203.0.113.77, 10.0.0.1',
    'x-real-ip': '203.0.113.78',
    cookie: 'camera_session=secret-cookie-value',
    authorization: 'Bearer secret-token',
    referer: 'https://camera.example/capture/abc?email=person@example.test',
    'accept-language': 'hu-HU,hu;q=0.9',
  }));
  assert.equal(response.status, 204);
  assert.ok(await settled(() => w.data.journey_events?.length === 2));
  const stored = JSON.stringify({ daily: w.data.journey_daily, events: w.data.journey_events });
  for (const forbidden of ['203.0.113', '10.0.0.1', 'Mozilla', 'iPhone', 'AppleWebKit', 'Safari', 'secret', 'person@example.test', 'camera_session', 'hu-HU', 'referer', 'capture/abc']) {
    assert.equal(stored.includes(forbidden), false, `${forbidden} must not be stored`);
  }
  assert.equal(w.data.journey_daily.find((r) => r.name === 'journey.start')?.key, 'ios', 'the device kind is the one word kept of the user agent');
});

test('the answer does not wait for the database: with a database that never answers the beacon still gets its 204 at once', async (t) => {
  setup(t, { hang: true });
  const { POST } = await load('hang');
  const started = Date.now();
  const response = await Promise.race([POST(request(batch([['photo.retake', null, 5]]))), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the beacon waited for the database')), 1000))]);
  assert.equal(response.status, 204);
  assert.ok(Date.now() - started < 500);
});

test('a database that fails does not turn into an error for the page: still 204', async (t) => {
  resetJourneySettingCache();
  resetJourneyEventCache();
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => { throw new Error('database down'); } } });
  const { POST } = await load('db-down');
  assert.equal((await POST(request(batch([['photo.retake', null, 5]])))).status, 204);
});

test('KILL SWITCH: while the recording is off the answer is the same 204 and nothing is written', async (t) => {
  const w = setup(t, { off: true });
  const { POST } = await load('off');
  const response = await POST(request(batch([['journey.start', null, 0], ['step.reach', 'camera', 10]])));
  assert.equal(response.status, 204);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal((w.data.journey_daily ?? []).length, 0);
  assert.equal((w.data.journey_events ?? []).length, 0);
  assert.equal(w.calls.some((c) => c.op === 'createIndex' || c.op === 'bulkWrite' || c.op === 'insertMany'), false);
});

test('a beacon for an event that does not exist is answered 204 and dropped', async (t) => {
  const w = setup(t);
  const { POST } = await load('unknown-event');
  assert.equal((await POST(request(batch([['photo.retake', null, 5]], new ObjectId().toString())))).status, 204);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal((w.data.journey_daily ?? []).length, 0);
});

test('invalid input answers 400 and writes nothing: not JSON, wrong version, no valid record, a server-only name', async (t) => {
  const w = setup(t);
  const { POST } = await load('invalid');
  for (const body of ['not json', '', JSON.stringify({ v: 9, s: SESSION, e: MONGO_ID, ev: [['photo.retake', null, 1]] }), batch([['page.view', null, 1]]), batch([['download', null, 1]]), batch([['share.view', null, 1]]), batch([])]) {
    assert.equal((await POST(request(body))).status, 400, body.slice(0, 40));
  }
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal((w.data.journey_daily ?? []).length, 0);
});

test('a body over 4 KB answers 413, by its declared length and by its real length', async (t) => {
  setup(t);
  const { POST } = await load('too-big');
  const big = batch([['photo.retake', null, 1]]).replace('"ev"', `"pad":"${'x'.repeat(JOURNEY_MAX_BYTES)}","ev"`);
  assert.equal((await POST(request(big))).status, 413);
  assert.equal((await POST(request(batch([['photo.retake', null, 1]]), { 'content-length': String(JOURNEY_MAX_BYTES + 1) }))).status, 413);
});

test('it is rate limited per IP address: a flood is answered 429, another address is not affected', async (t) => {
  setup(t);
  const { POST } = await load('rate');
  const flood = '198.51.100.250';
  let refused = 0;
  for (let i = 0; i < 620; i += 1) if ((await POST(request(batch([['photo.retake', null, 1]]), {}, flood))).status === 429) refused += 1;
  assert.ok(refused >= 15 && refused <= 25, `refused ${refused}`);
  assert.equal((await POST(request(batch([['photo.retake', null, 1]]), {}, '198.51.100.251'))).status, 204);
});
