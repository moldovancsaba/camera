import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { inactiveEventSelfiesPath } from './inactive-event-destination';

test('uses a configured greatest-selfies slug when it is a safe path segment', () => {
  assert.equal(
    inactiveEventSelfiesPath({ _id: new ObjectId(), greatestHitsSlug: 'MTK-Budapest' }),
    '/greatest-hits/mtk-budapest',
  );
});

test('falls back to the event id when the configured slug is not safe', () => {
  const id = new ObjectId();
  assert.equal(
    inactiveEventSelfiesPath({ _id: id, greatestHitsSlug: '../other-event' }),
    `/greatest-hits/${id.toHexString()}`,
  );
});

test('uses the home page only when neither a valid slug nor an event id is available', () => {
  assert.equal(
    inactiveEventSelfiesPath({ _id: undefined, greatestHitsSlug: null }),
    '/',
  );
});
