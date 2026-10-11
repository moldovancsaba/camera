import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';
import { JOURNEY_RETENTION_SECONDS } from '@/lib/db/ensure-indexes';
import type { JourneyBatch, JourneyEvent } from './events';
import { JOURNEY_SETTING_ID, resetJourneySettingCache } from './setting';
import { SERVER_VISIT, dayOf, recordJourneyBatch, recordServerJourney, resetJourneyEventCache, resetJourneyIndexCheck, resolveJourneyEvent, rollupOf, storeJourneyBatch } from './store';

const MONGO_ID = new ObjectId().toString();
const UUID = 'b3a2c0de-1111-4222-8333-944455556666';
const NOW = new Date('2026-10-16T18:30:00.000Z');
const ev = (name: JourneyEvent['name'], key = '', ms = 0): JourneyEvent => ({ name, key, ms });

beforeEach(() => {
  resetJourneySettingCache();
  resetJourneyEventCache();
  resetJourneyIndexCheck();
});

const seed = () => fakeDb({ events: [{ _id: new ObjectId(MONGO_ID), eventId: UUID, name: 'Match' }] });

test('rollupOf adds the records of a batch up by name and key', () => {
  assert.deepEqual(rollupOf([ev('step.reach', 'camera'), ev('step.reach', 'camera'), ev('step.reach', 'reframe'), ev('photo.retake')]).map((r) => [r.name, r.key, r.count]), [['step.reach', 'camera', 2], ['step.reach', 'reframe', 1], ['photo.retake', '', 1]]);
});

test('a batch bumps the daily count of each name and key and keeps one row per record; a second batch adds to the same counts', async () => {
  const w = seed();
  await recordJourneyBatch(w.db, { eventId: UUID, session: 'visit-0001', events: [ev('journey.start', 'ios'), ev('step.reach', 'camera', 1200), ev('step.reach', 'camera', 1300)] }, NOW);
  await recordJourneyBatch(w.db, { eventId: UUID, session: 'visit-0002', events: [ev('journey.start', 'android'), ev('step.reach', 'camera', 900)] }, new Date('2026-10-16T19:00:00.000Z'));
  const daily = Object.fromEntries(w.data.journey_daily.map((r) => [`${r.name}:${r.key}`, r.count]));
  assert.deepEqual(daily, { 'journey.start:ios': 1, 'journey.start:android': 1, 'step.reach:camera': 3 });
  assert.ok(w.data.journey_daily.every((r) => r.eventId === UUID && r.day === '2026-10-16'));
  assert.equal(w.data.journey_events.length, 5);
  assert.deepEqual(w.data.journey_events.map((r) => r.session), ['visit-0001', 'visit-0001', 'visit-0001', 'visit-0002', 'visit-0002']);
});

test('a row has exactly the anonymous fields: the event, the visit id, the name, the key, the time since the page opened and the time to expire from; nothing about a person', async () => {
  const w = seed();
  await recordJourneyBatch(w.db, { eventId: UUID, session: 'visit-0001', events: [ev('photo.taken', 'system', 4000)] }, NOW);
  const row = w.data.journey_events[0];
  assert.deepEqual(Object.keys(row).sort(), ['at', 'eventId', 'key', 'ms', 'name', 'session']);
  assert.ok(row.at instanceof Date, 'a real date, so the TTL index can expire it');
  assert.deepEqual(Object.keys(w.data.journey_daily[0]).sort(), ['count', 'day', 'eventId', 'key', 'name']);
  const text = JSON.stringify([w.data.journey_events, w.data.journey_daily]);
  for (const forbidden of ['ip', 'agent', 'user', 'cookie', 'email', 'mail', 'Mozilla']) assert.equal(text.toLowerCase().includes(`"${forbidden}`), false, forbidden);
});

test('the first write asks for the indexes: the 30 day TTL on the time of the row, and the unique key of the daily count; once, not at every write', async () => {
  const w = seed();
  await recordJourneyBatch(w.db, { eventId: UUID, session: 'visit-0001', events: [ev('photo.retake')] }, NOW);
  await recordJourneyBatch(w.db, { eventId: UUID, session: 'visit-0001', events: [ev('photo.retake')] }, NOW);
  const created = w.calls.filter((c) => c.op === 'createIndex');
  assert.equal(created.length, 3, 'three indexes, once');
  const ttl = created.find((c) => (c.args[1] as { name?: string }).name === 'journey_events_at_ttl');
  assert.ok(ttl);
  assert.deepEqual(ttl.args[0], { at: 1 });
  assert.equal((ttl.args[1] as { expireAfterSeconds: number }).expireAfterSeconds, JOURNEY_RETENTION_SECONDS);
  assert.equal(JOURNEY_RETENTION_SECONDS, 30 * 24 * 60 * 60);
  const unique = created.find((c) => (c.args[1] as { name?: string }).name === 'journey_daily_event_day_name_key_unique');
  assert.equal((unique?.args[1] as { unique: boolean }).unique, true);
});

test('a write that fails is swallowed: the other write still happens and nothing is thrown', async () => {
  const w = seed();
  const broken = { collection: (name: string) => (name === 'journey_daily' ? { bulkWrite: async () => { throw new Error('daily down'); }, createIndex: async () => 'x' } : w.db.collection(name)) } as unknown as typeof w.db;
  await assert.doesNotReject(recordJourneyBatch(broken, { eventId: UUID, session: 'visit-0001', events: [ev('photo.retake')] }, NOW));
  assert.equal(w.data.journey_events.length, 1);
});

test('the event is found by its Mongo id or its UUID, and an event that does not exist is null; the answer is kept for a while', async () => {
  const w = seed();
  assert.equal(await resolveJourneyEvent(w.db, MONGO_ID), UUID);
  assert.equal(await resolveJourneyEvent(w.db, UUID), UUID);
  assert.equal(await resolveJourneyEvent(w.db, new ObjectId().toString()), null);
  assert.equal(await resolveJourneyEvent(w.db, 'not-an-event-at-all'), null);
  let reads = 0;
  const counting = { collection: () => ({ findOne: async () => { reads += 1; return { _id: new ObjectId(), eventId: 'u-1' }; } }) } as unknown as typeof w.db;
  resetJourneyEventCache();
  for (let i = 0; i < 20; i += 1) await resolveJourneyEvent(counting, 'flood-of-beacons', 1000 + i);
  assert.equal(reads, 1);
});

test('an event with no UUID is filed under its Mongo id, as the analytics reads it', async () => {
  const w = fakeDb({ events: [{ _id: new ObjectId(MONGO_ID), name: 'Old event' }] });
  assert.equal(await resolveJourneyEvent(w.db, MONGO_ID), MONGO_ID);
});

test('storeJourneyBatch: the device kind is put on the journey.start and nothing else; an unknown event and a switched-off recording write nothing', async () => {
  const w = seed();
  const batch: JourneyBatch = { session: 'visit-0001', event: MONGO_ID, events: [ev('journey.start'), ev('step.reach', 'welcome', 10)] };
  assert.equal(await storeJourneyBatch(w.db, batch, 'android', NOW), 'written');
  assert.deepEqual(w.data.journey_daily.map((r) => `${r.name}:${r.key}`).sort(), ['journey.start:android', 'step.reach:welcome']);

  const unknown = await storeJourneyBatch(w.db, { ...batch, event: new ObjectId().toString() }, 'ios', NOW);
  assert.equal(unknown, 'unknown_event');
  assert.equal(w.data.journey_events.length, 2);

  w.data.admin_settings = [{ settingId: JOURNEY_SETTING_ID, enabled: false }];
  resetJourneySettingCache();
  assert.equal(await storeJourneyBatch(w.db, batch, 'ios', NOW), 'disabled');
  assert.equal(w.data.journey_events.length, 2, 'nothing written while it is off');
});

test('recordServerJourney: the share page view and the download are recorded against the event of the photo, as a visit of the server; nothing when the recording is off or the event is unknown', async () => {
  const w = seed();
  await recordServerJourney(w.db, UUID, 'share.view', NOW);
  await recordServerJourney(w.db, MONGO_ID, 'download', NOW);
  await recordServerJourney(w.db, null, 'download', NOW);
  await recordServerJourney(w.db, 'missing-event-1234', 'download', NOW);
  assert.deepEqual(w.data.journey_daily.map((r) => `${r.name}:${r.count}`).sort(), ['download:1', 'share.view:1']);
  assert.ok(w.data.journey_events.every((r) => r.session === SERVER_VISIT));
  w.data.admin_settings = [{ settingId: JOURNEY_SETTING_ID, enabled: false }];
  resetJourneySettingCache();
  await recordServerJourney(w.db, UUID, 'download', NOW);
  assert.equal(w.data.journey_events.length, 2);
});

test('the day is the UTC day', () => {
  assert.equal(dayOf(new Date('2026-10-16T23:59:59.000Z')), '2026-10-16');
  assert.equal(dayOf(new Date('2026-10-17T00:00:00.000Z')), '2026-10-17');
});
