import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { countPhotoQueue, countWaitingPhotos, isQueueStatus, loadPhotoQueue, queueFilter, toPhotoQueueItem } from './queue';

const base = () => ({
  _id: new ObjectId(),
  createdAt: '2026-10-06T12:00:00.000Z',
  userInfo: { name: 'Ann', email: 'ann@example.com' },
  reviewStatus: 'pending_review',
  frameVariant: { index: 0, message: 'Go', imageUrl: 'https://s/x.png' },
  photoReview: { photoUrl: 'https://s/pending/e/abc.jpg', shareOptIn: true },
  reviewHistory: [],
});

test('a waiting photo shows its private photo and the guest; a try-on request held with an old photo is not shown', () => {
  const item = toPhotoQueueItem({ ...base(), photoReview: { photoUrl: 'https://s/pending/e/abc.jpg', shareOptIn: true, tryOn: { leatherSuitId: 's' } }, tryOnRequest: { requested: true } });
  assert.deepEqual([item.status, item.name, item.email, item.photoUrl, item.frameKind, item.shareOptIn, item.last], ['pending_review', 'Ann', 'ann@example.com', 'https://s/pending/e/abc.jpg', 'generated', true, null]);
  assert.equal('tryOnRequested' in item, false);
});

test('an approved photo shows the real picture and the last decision', () => {
  const item = toPhotoQueueItem({
    ...base(),
    reviewStatus: 'approved',
    imageUrl: 'https://s/submission-1.jpg',
    photoReview: { photoUrl: null, shareOptIn: false },
    reviewHistory: [{ action: 'reject', by: 'a', at: 't1', reason: 'blurry' }, { action: 'approve', by: 'mod@example.com', at: 't2', reason: null }],
  });
  assert.equal(item.photoUrl, 'https://s/submission-1.jpg');
  assert.deepEqual(item.last, { action: 'approve', by: 'mod@example.com', at: 't2', reason: null });
});

test('frame kinds and missing names are read defensively', () => {
  assert.equal(toPhotoQueueItem({ ...base(), frameVariant: undefined, frameId: 'f1' }).frameKind, 'own');
  assert.equal(toPhotoQueueItem({ ...base(), frameVariant: undefined }).frameKind, 'none');
  const anonymous = toPhotoQueueItem({ ...base(), userInfo: undefined, userName: undefined });
  assert.deepEqual([anonymous.name, anonymous.email], ['Guest', null]);
});

test('the queue covers photos that went through vetting for one event, not archived', () => {
  assert.deepEqual(queueFilter('e1', 'pending_review'), {
    $or: [{ eventId: 'e1' }, { eventIds: { $in: ['e1'] } }],
    photoReview: { $exists: true },
    reviewStatus: 'pending_review',
    isArchived: { $ne: true },
  });
  assert.equal(isQueueStatus('rejected'), true);
  assert.equal(isQueueStatus('hidden'), false);
});

test('the waiting list is oldest first, decided lists newest first, and the counts cover the three states', async () => {
  const sorts: unknown[] = [];
  const counted: unknown[] = [];
  const db = {
    collection: () => ({
      find: () => ({ sort: (s: unknown) => (sorts.push(s), { limit: () => ({ toArray: async () => [base()] }) }) }),
      countDocuments: async (filter: { reviewStatus: string }) => (counted.push(filter.reviewStatus), filter.reviewStatus === 'pending_review' ? 3 : 1),
    }),
  } as never;
  assert.equal((await loadPhotoQueue(db, 'e1', 'pending_review')).length, 1);
  await loadPhotoQueue(db, 'e1', 'approved');
  assert.deepEqual(sorts, [{ createdAt: 1 }, { createdAt: -1 }]);
  assert.deepEqual(await countPhotoQueue(db, 'e1'), { pending_review: 3, rejected: 1, approved: 1 });
  assert.deepEqual(counted, ['pending_review', 'rejected', 'approved']);
});

test('waiting photos are counted in total and per event, for every event or only for the ones given', async () => {
  const pipelines: Array<Array<{ $match?: { eventId: unknown } }>> = [];
  const db = {
    collection: () => ({
      aggregate: (pipeline: Array<{ $match?: { eventId: unknown } }>) => (pipelines.push(pipeline), { toArray: async () => [{ _id: 'e1', count: 3 }, { _id: 'e2', count: 1 }] }),
    }),
  } as never;
  const all = await countWaitingPhotos(db, null);
  assert.equal(all.total, 4);
  assert.deepEqual([...all.byEvent], [['e1', 3], ['e2', 1]]);
  assert.deepEqual(pipelines[0][0].$match?.eventId, { $type: 'string' });
  await countWaitingPhotos(db, ['e1']);
  assert.deepEqual(pipelines[1][0].$match?.eventId, { $in: ['e1'] });
  const none = await countWaitingPhotos(db, []);
  assert.equal(none.total, 0);
  assert.equal(pipelines.length, 2, 'no events, no query');
});
