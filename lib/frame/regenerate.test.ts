import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { eventsUsingFrame } from './regenerate';

test('the events using a frame are those with a message written on it, alone or among several designs (issue 449)', async () => {
  const { db } = fakeDb({
    events: [
      { eventId: 'one', frameDesign: { messageFrames: { A: 'blue' } } },
      { eventId: 'many', frameDesign: { messageFrames: { A: 'pink', B: ['green', 'blue'] } } },
      { eventId: 'other', frameDesign: { messageFrames: { A: 'pink' } } },
      { eventId: 'none', frameDesign: {} },
    ],
  });
  assert.deepEqual((await eventsUsingFrame(db, 'blue')).map((event) => event.eventId), ['one', 'many']);
  assert.deepEqual((await eventsUsingFrame(db, 'green')).map((event) => event.eventId), ['many']);
  assert.deepEqual(await eventsUsingFrame(db, 'red'), []);
});
