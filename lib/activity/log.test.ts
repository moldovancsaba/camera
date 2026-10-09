import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { activityLogEnabled, activityOf, isManagementPath, isRepeat, outcomeOf, recordActivity, type ObservedRequest } from './log';

const req = (method: string, pathname: string, query = ''): ObservedRequest => ({ method, pathname, search: new URLSearchParams(query) });
const ADMIN = { id: 'u1', email: ' Admin@Example.TEST ', role: 'admin' };
const NOW = new Date('2026-10-09T20:00:00.000Z');

test('what a person who manages the service changes is an activity, with who, when and what', () => {
  const r = activityOf(req('PATCH', '/api/slideshows', 'id=abc&secret=x'), 200, ADMIN, NOW);
  assert.deepEqual(r, { at: '2026-10-09T20:00:00.000Z', method: 'PATCH', path: '/api/slideshows?id=abc', status: 200, outcome: 'ok', userId: 'u1', userEmail: 'admin@example.test', role: 'admin' });
  assert.equal(activityOf(req('DELETE', '/api/admin/events/e1/gallery-frame'), 200, ADMIN, NOW)?.outcome, 'ok');
});

test('a read is not an activity unless the server failed it; a guest\'s photo or a beacon is not an activity when it works', () => {
  assert.equal(activityOf(req('GET', '/api/events/e1'), 200, ADMIN, NOW), null);
  assert.equal(activityOf(req('GET', '/api/events/e1'), 404, ADMIN, NOW), null, 'a missing page is not an event of its own');
  assert.equal(activityOf(req('GET', '/api/events/e1'), 500, null, NOW)?.outcome, 'error');
  assert.equal(activityOf(req('POST', '/api/submissions'), 201, { id: 'g1', email: 'guest@example.test' }, NOW), null, 'a guest\'s photo is not a management action');
  assert.equal(activityOf(req('PATCH', '/api/slideshows', 'id=a'), 200, null, NOW), null, 'nobody signed in: not recorded as a person\'s action');
  assert.equal(activityOf(req('POST', '/api/slideshows/s1/played'), 200, ADMIN, NOW), null);
});

test('every refused or failed request is an activity, with the reason, for anybody (anonymous too)', () => {
  const refused = activityOf(req('POST', '/api/admin/media-health'), 403, { id: 'u2', email: 'x@example.test', role: 'user' }, NOW, '  Global admin access\n is required ');
  assert.equal(refused?.outcome, 'refused');
  assert.equal(refused?.message, 'Global admin access is required');
  const failed = activityOf(req('POST', '/api/submissions'), 500, null, NOW, 'x'.repeat(500));
  assert.equal(failed?.outcome, 'error');
  assert.equal(failed?.userId, null);
  assert.equal(failed?.message?.length, 300);
  assert.equal(activityOf(req('POST', '/api/observability/capture-diagnostic'), 400, null, NOW), null, 'beacons are noise');
  assert.equal(activityOf(req('GET', '/api/auth/session'), 500, null, NOW), null);
});

test('only the ids of the query are kept, never anything else', () => {
  const r = activityOf(req('PUT', '/api/events/e1', 'id=1&eventId=2&token=SECRET&slug=s&password=p'), 200, ADMIN, NOW);
  assert.equal(r?.path, '/api/events/e1?id=1&eventId=2&slug=s');
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('the same failure by the same person on the same path is written once a minute, an action every time', () => {
  const seen = new Map<string, number>();
  const failure = activityOf(req('POST', '/api/events/e1'), 400, ADMIN, NOW, 'bad')!;
  assert.equal(isRepeat(failure, 1_000, seen), false);
  assert.equal(isRepeat(failure, 30_000, seen), true);
  assert.equal(isRepeat(failure, 62_000, seen), false);
  const action = activityOf(req('POST', '/api/events/e1'), 200, ADMIN, NOW)!;
  assert.equal(isRepeat(action, 1_000, seen), false);
  assert.equal(isRepeat(action, 1_001, seen), false);
  const other = { ...failure, userId: 'u9' };
  assert.equal(isRepeat(other, 63_000, seen), false, 'another person is another record');
});

test('paths, outcomes and the switch', () => {
  assert.equal(isManagementPath('/api/admin/anything'), true);
  assert.equal(isManagementPath('/api/events'), true);
  assert.equal(isManagementPath('/api/events/e1/register'), true, 'a sub-path of events is under the prefix; the register call of a guest is a POST that is ok without a signed-in person and so not recorded');
  assert.equal(isManagementPath('/api/eventsfoo'), false);
  assert.equal(isManagementPath('/api/submissions'), false);
  assert.deepEqual([200, 302, 400, 404, 499, 500, 503].map(outcomeOf), ['ok', 'ok', 'refused', 'refused', 'refused', 'error', 'error']);
  assert.equal(activityLogEnabled({ VERCEL_ENV: 'production' }), true);
  assert.equal(activityLogEnabled({ VERCEL_ENV: 'preview' }), false);
  assert.equal(activityLogEnabled({}), false);
  assert.equal(activityLogEnabled({ ACTIVITY_LOG: '1' }), true);
  assert.equal(activityLogEnabled({ VERCEL_ENV: 'production', ACTIVITY_LOG: '0' }), false);
});

test('a record is written to the log and a failing database never throws', async () => {
  const { db, data } = fakeDb({});
  const r = activityOf(req('PATCH', '/api/slideshows', 'id=abc'), 200, ADMIN, NOW)!;
  assert.equal(await recordActivity(db, r), true);
  assert.equal(data.activity_log.length, 1);
  const broken = { collection: () => ({ insertOne: async () => { throw new Error('down'); } }) } as never;
  assert.equal(await recordActivity(broken, r), false);
});
