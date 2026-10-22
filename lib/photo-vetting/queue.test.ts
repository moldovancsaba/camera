import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { countPhotoQueue, countWaitingPhotos, isQueueStatus, loadPhotoQueue, queueFilter, toPhotoAnalysisItem, toPhotoQueueItem } from './queue';
import { STANDARD_VOCABULARY as V, resolveVocabulary } from './vocabulary';

const base = () => ({
  _id: new ObjectId(),
  createdAt: '2026-10-06T12:00:00.000Z',
  userInfo: { name: 'Ann', email: 'ann@example.com' },
  reviewStatus: 'pending_review',
  consentStatus: 'received',
  frameVariant: { index: 0, message: 'Go', imageUrl: 'https://s/x.png' },
  photoReview: { photoUrl: 'https://s/pending/e/abc.jpg', shareOptIn: true },
  reviewHistory: [],
});

test('a waiting photo shows its private photo and the guest; a try-on request held with an old photo is not shown', () => {
  const item = toPhotoQueueItem({ ...base(), photoReview: { photoUrl: 'https://s/pending/e/abc.jpg', shareOptIn: true, tryOn: { leatherSuitId: 's' } }, tryOnRequest: { requested: true } }, V);
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
  }, V);
  assert.equal(item.photoUrl, 'https://s/submission-1.jpg');
  assert.equal(item.approvalEmailSent, false);
  assert.deepEqual(item.last, { action: 'approve', by: 'mod@example.com', at: 't2', reason: null });
});

test('approval email retry status accepts the actual successful send markers and an older address field', () => {
  const needsRetry = toPhotoQueueItem({ ...base(), reviewStatus: 'approved', userInfo: undefined, userEmail: 'legacy@example.com' }, V);
  const sent = toPhotoQueueItem({ ...base(), reviewStatus: 'approved', metadata: { emailSentAfterSave: true } }, V);
  assert.deepEqual([needsRetry.email, needsRetry.approvalEmailSent], ['legacy@example.com', false]);
  assert.equal(sent.approvalEmailSent, true);
});

test('a returned approved photo uses its published composite when the private source is gone', () => {
  const item = toPhotoQueueItem({
    ...base(), reviewStatus: 'pending_review', imageUrl: 'https://s/already-approved.jpg',
    photoReview: { photoUrl: null, returnedAt: '2026-10-13T12:00:00.000Z' },
    reviewHistory: [{ action: 'return_to_vetting', by: 'mod@example.com', at: 't3' }],
  }, V);
  assert.equal(item.photoUrl, 'https://s/already-approved.jpg');
  assert.deepEqual(item.last, { action: 'return_to_vetting', by: 'mod@example.com', at: 't3', reason: null });
});

test('frame kinds and missing names are read defensively', () => {
  assert.equal(toPhotoQueueItem({ ...base(), frameVariant: undefined, frameId: 'f1' }, V).frameKind, 'own');
  assert.equal(toPhotoQueueItem({ ...base(), frameVariant: undefined }, V).frameKind, 'none');
  const anonymous = toPhotoQueueItem({ ...base(), userInfo: undefined, userName: undefined }, V);
  assert.deepEqual([anonymous.name, anonymous.email], ['Guest', null]);
});

test('the people of a photo are read with the vocabulary of the event: a custom option still reads as marked, and the standard list alone would lose it', () => {
  const people = [{ id: 'a', box: { x: 10, y: 10, w: 20, h: 20 }, gender: 'female', age: 'adult', merch: ['poncho'] }];
  const event = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'poncho', label: 'Poncho', custom: true }] } });
  const withEventList = toPhotoQueueItem({ ...base(), people }, event);
  assert.deepEqual([withEventList.peopleMarked, withEventList.people.length, withEventList.peopleCount, withEventList.people[0].merch], [true, 1, 1, ['poncho']]);
  const withStandardList = toPhotoQueueItem({ ...base(), people }, V);
  assert.deepEqual([withStandardList.peopleMarked, withStandardList.people.length, withStandardList.peopleCount], [true, 0, null], 'a vocabulary mismatch is not reported as a valid zero');
  const hiddenLater = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'scarf', hidden: true }] } });
  assert.equal(toPhotoQueueItem({ ...base(), people: [{ ...people[0], merch: ['scarf'] }] }, hiddenLater).people.length, 1, 'an option hidden since still reads in the photo it was given to');
});

test('the queue reads the people of every photo with the vocabulary it is given', async () => {
  const doc = { ...base(), people: [{ id: 'a', box: { x: 10, y: 10, w: 20, h: 20 }, gender: 'female', age: 'adult', merch: ['poncho'] }] };
  const db = { collection: () => ({ find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [doc] }) }) }) }) } as never;
  const event = resolveVocabulary({ event: { options: [{ group: 'merch', key: 'poncho', label: 'Poncho', custom: true }] } });
  assert.equal((await loadPhotoQueue(db, 'e1', 'pending_review', event))[0].people.length, 1);
  assert.equal((await loadPhotoQueue(db, 'e1', 'pending_review', V))[0].people.length, 0);
});

test('the completed analysis card data keeps the unframed source and the saved people count, including zero', () => {
  const person = { id: 'a', box: { x: 10, y: 10, w: 20, h: 20 }, gender: 'female', age: 'adult', merch: [] };
  const onePerson = toPhotoAnalysisItem({
    ...base(),
    reviewStatus: 'approved',
    imageUrl: 'https://s/framed.jpg',
    people: [person],
    photoReview: { photoUrl: 'https://s/unframed.jpg', shareOptIn: true },
  }, V);
  const nobody = toPhotoAnalysisItem({ ...base(), people: [] }, V);

  assert.equal(onePerson.analysisPhotoUrl, 'https://s/unframed.jpg');
  assert.equal(onePerson.peopleCount, 1);
  assert.equal(nobody.peopleCount, 0, 'a saved empty array means analysis was completed and nobody was marked');
  const unreadable = toPhotoAnalysisItem({ ...base(), people: [{ not: 'a person tag' }] }, V);
  assert.equal(unreadable.peopleCount, null, 'malformed saved data needs review instead of looking like zero people');
});

test('the reject reasons of a rejected photo are on its item: the keys, none for a photo rejected before reasons existed, and only text keys are kept', () => {
  assert.deepEqual(toPhotoQueueItem({ ...base(), reviewStatus: 'rejected', rejectReasons: ['nudity', 'alcohol'] }, V).rejectReasons, ['nudity', 'alcohol']);
  assert.deepEqual(toPhotoQueueItem({ ...base(), reviewStatus: 'rejected' }, V).rejectReasons, []);
  assert.deepEqual(toPhotoQueueItem({ ...base(), rejectReasons: ['nudity', 3, null, ''] }, V).rejectReasons, ['nudity']);
  assert.deepEqual(toPhotoQueueItem({ ...base(), rejectReasons: 'nudity' }, V).rejectReasons, []);
});

test('the queue covers photos that went through vetting for one event, not archived', () => {
  assert.deepEqual(queueFilter('e1', 'pending_review'), {
    $and: [
      { $or: [{ eventId: 'e1' }, { eventIds: { $in: ['e1'] } }] },
      { consentStatus: 'received' },
      {
        photoReview: { $exists: true },
        reviewStatus: 'pending_review',
        isArchived: { $ne: true },
        retentionStatus: { $nin: ['pending_erasure', 'erasing', 'erased'] },
      },
    ],
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
      countDocuments: async (filter: { $and?: Array<Record<string, unknown>> }) => {
        const status = filter.$and?.find((clause) => typeof clause.reviewStatus === 'string')?.reviewStatus as string | undefined;
        if (!status) return 0;
        counted.push(status);
        return status === 'pending_review' ? 3 : 1;
      },
    }),
  } as never;
  assert.equal((await loadPhotoQueue(db, 'e1', 'pending_review', V)).length, 1);
  await loadPhotoQueue(db, 'e1', 'approved', V);
  assert.deepEqual(sorts, [{ createdAt: 1 }, { createdAt: -1 }]);
  assert.deepEqual(await countPhotoQueue(db, 'e1'), { pending_review: 3, rejected: 1, approved: 1, consentPending: 0, consentUnknown: 0 });
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
