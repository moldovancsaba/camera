import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fakeDb } from '@/lib/library/fake-db';
import { eventVettingPath } from './vetting-path';

const ID = new ObjectId('64b7f0a1c2d3e4f5a6b7c8d9');
const UUID = '11111111-2222-3333-4444-555555555555';

test('an event uuid (the messmass link) or an event id leads to the Vetting tab of that event; an unknown or empty reference leads nowhere', async () => {
  const { db } = fakeDb({ [COLLECTIONS.EVENTS]: [{ _id: ID, eventId: UUID, name: 'MTK' }] });
  assert.equal(await eventVettingPath(db, UUID), `/admin/events/${ID}/vetting`);
  assert.equal(await eventVettingPath(db, ` ${UUID} `), `/admin/events/${ID}/vetting`);
  assert.equal(await eventVettingPath(db, String(ID)), `/admin/events/${ID}/vetting`);
  assert.equal(await eventVettingPath(db, 'no-such-event'), null);
  assert.equal(await eventVettingPath(db, '64b7f0a1c2d3e4f5a6b7c8da'), null);
  assert.equal(await eventVettingPath(db, '   '), null);
});
