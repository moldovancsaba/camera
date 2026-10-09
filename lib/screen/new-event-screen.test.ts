import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { ObjectId } from 'mongodb';
import { fakeDb } from '@/lib/library/fake-db';

const EVENT_ID = new ObjectId();

type Module = typeof import('./new-event-screen');
const importModule = (caseId: string) => import('./new-event-screen?case=' + caseId) as Promise<Module>;

function setup(t: TestContext, options: { slideshow?: { ok: true; slideshowId: string; created: boolean } | { ok: false; reason: string }; throws?: boolean; noEvent?: boolean } = {}) {
  const event = { _id: EVENT_ID, eventId: 'e-uuid', name: 'Event' };
  const seeded = fakeDb({ events: options.noEvent ? [] : [event] });
  const calls: string[] = [];
  t.mock.method(console, 'warn', () => undefined);
  t.mock.module('@/lib/db/mongodb', { namedExports: { connectToDatabase: async () => seeded.db } });
  t.mock.module('next/server', { namedExports: { after: () => { throw new Error('outside a request scope'); } } });
  t.mock.module('@/lib/slideshow/default-slideshow', { namedExports: { ensureDefaultSlideshow: async () => { calls.push('slideshow'); if (options.throws) throw new Error('boom'); return options.slideshow ?? { ok: true, slideshowId: 's1', created: true }; } } });
  t.mock.module('./welcome-screen-store', { namedExports: { ensureWelcomeScreen: async () => { calls.push('screen'); return { ok: true, url: 'https://blob.example/w.png', created: true }; } } });
  return calls;
}

test('a new event gets its default slideshow and then the picture drawn from it', async (t) => {
  const calls = setup(t);
  await (await importModule('both')).makeScreenForNewEvent(String(EVENT_ID));
  assert.deepEqual(calls, ['slideshow', 'screen']);
});

test('when the slideshow could not be made the picture is not drawn, and nothing is thrown', async (t) => {
  const calls = setup(t, { slideshow: { ok: false, reason: 'No free slug was found. Try again.' } });
  await (await importModule('no-slideshow')).makeScreenForNewEvent(String(EVENT_ID));
  assert.deepEqual(calls, ['slideshow']);
});

test('an error anywhere is swallowed: creating an event must never fail because of its screen', async (t) => {
  setup(t, { throws: true });
  await assert.doesNotReject((await importModule('throws')).makeScreenForNewEvent(String(EVENT_ID)));
});

test('an event that is gone is skipped', async (t) => {
  const calls = setup(t, { noEvent: true });
  await (await importModule('gone')).makeScreenForNewEvent(String(EVENT_ID));
  assert.deepEqual(calls, []);
});

test('outside a request nothing is scheduled and nothing is thrown', async (t) => {
  setup(t);
  assert.doesNotThrow(() => void (async () => (await importModule('schedule')).scheduleScreenForNewEvent(String(EVENT_ID)))());
  assert.doesNotThrow((await importModule('schedule')).scheduleScreenForNewEvent.bind(null, String(EVENT_ID)));
});
