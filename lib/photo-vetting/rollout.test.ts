import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { rolloutDryRun, runRollout } from './rollout';

const NOW = new Date('2026-10-06T12:00:00.000Z');
const ids = { busy: new ObjectId(), quiet: new ObjectId(), week: new ObjectId(), on: new ObjectId() };

interface Calls { counts: unknown[]; updates: Array<{ filter: unknown; update: unknown }>; pipeline: unknown[] }

function fakeDb(calls: Calls) {
  const offEvents = [
    { _id: ids.busy, eventId: 'u-busy', name: 'Busy event', partnerName: 'P' },
    { _id: ids.quiet, eventId: 'u-quiet', name: 'Quiet event' },
    { _id: ids.week, eventId: 'u-week', name: 'Week event' },
  ];
  return {
    collection: (name: string) => {
      if (name === 'events') {
        return {
          countDocuments: async (filter: Record<string, unknown>) => (calls.counts.push(filter), Object.keys(filter).length === 0 ? 4 : 3),
          find: () => ({ toArray: async () => offEvents }),
          updateMany: async (filter: unknown, update: unknown) => (calls.updates.push({ filter, update }), { modifiedCount: 3 }),
        };
      }
      return {
        aggregate: (pipeline: unknown[]) => (calls.pipeline.push(pipeline), {
          toArray: async () => [
            { _id: 'u-busy', photosLast24h: 12, photosLast7d: 40, lastPhotoAt: '2026-10-06T11:00:00.000Z' },
            { _id: 'u-week', photosLast24h: 0, photosLast7d: 5, lastPhotoAt: '2026-10-02T11:00:00.000Z' },
            { _id: 'u-on', photosLast24h: 3, photosLast7d: 3, lastPhotoAt: '2026-10-06T10:00:00.000Z' },
          ],
        }),
      };
    },
  } as never;
}

test('the dry run counts the events and lists the ones that took photos today, and writes nothing', async () => {
  const calls: Calls = { counts: [], updates: [], pipeline: [] };
  const report = await rolloutDryRun(fakeDb(calls), NOW);
  assert.deepEqual([report.totalEvents, report.alreadyOn, report.toTurnOn], [4, 1, 3]);
  assert.deepEqual(report.busyNow.map((row) => [row.name, row.photosLast24h, row.photosLast7d]), [['Busy event', 12, 40]]);
  assert.equal(report.activeThisWeek, 2, 'an event that is already on is not listed');
  assert.equal(calls.updates.length, 0);
  const match = (calls.pipeline[0] as Array<{ $match?: { createdAt: { $gte: string } } }>)[0].$match;
  assert.equal(match?.createdAt.$gte, '2026-09-29T12:00:00.000Z', 'looks back seven days');
});

test('the run turns the setting on for the events that do not have it, attributed to the admin, and reports the totals', async () => {
  const calls: Calls = { counts: [], updates: [], pipeline: [] };
  const result = await runRollout(fakeDb(calls), 'admin@example.com', NOW);
  assert.equal(calls.updates.length, 1);
  assert.deepEqual(calls.updates[0].filter, { 'photoVetting.required': { $ne: true } });
  assert.deepEqual((calls.updates[0].update as { $set: { photoVetting: unknown } }).$set.photoVetting, { required: true, updatedAt: '2026-10-06T12:00:00.000Z', updatedBy: 'rollout: admin@example.com' });
  assert.equal(result.turnedOn, 3);
});
