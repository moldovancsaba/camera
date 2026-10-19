import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMediaFeedPipeline } from './media-feed';

const stages = (since?: string) => buildMediaFeedPipeline('evt-1', since, 50) as Array<Record<string, Record<string, unknown> & unknown[]>>;

test('the feed covers one event, no try-on results, only photos with a picture that are not waiting or rejected', () => {
  const [match] = stages();
  const filter = match.$match as Record<string, unknown>;
  const clauses = filter.$and as Array<Record<string, unknown>>;
  const eventClause = clauses.find((clause) => Array.isArray(clause.$or)
    && (clause.$or as Array<Record<string, unknown>>).some((alternative) => 'eventId' in alternative));
  const imageClause = clauses.find((clause) => Array.isArray(clause.$or)
    && (clause.$or as Array<Record<string, unknown>>).some((alternative) => 'originalImageUrl' in alternative));
  const visibilityClause = clauses.find((clause) => Array.isArray(clause.$and)
    && (clause.$and as Array<Record<string, unknown>>).some((nested) => 'reviewStatus' in nested));

  assert.deepEqual(eventClause?.$or, [{ eventId: 'evt-1' }, { eventIds: 'evt-1' }]);
  assert.deepEqual(clauses.find((clause) => 'submissionKind' in clause)?.submissionKind, { $ne: 'tryon_result' });
  assert.deepEqual(imageClause?.$or, [
    { originalImageUrl: { $type: 'string', $ne: '' } },
    { imageUrl: { $type: 'string', $ne: '' } },
    { finalImageUrl: { $type: 'string', $ne: '' } },
  ]);
  assert.deepEqual((visibilityClause?.$and as Array<Record<string, unknown>>).find((nested) => 'reviewStatus' in nested)?.reviewStatus, { $nin: ['awaiting_contact', 'pending_review', 'rejected'] });
});

test('photos are ordered and cut by when they became available: the approval for a vetted photo, the capture for any other', () => {
  const pipeline = stages('2026-10-06T10:00:00.000Z');
  assert.deepEqual(pipeline[1], { $addFields: { availableAt: { $ifNull: ['$approvedAt', '$createdAt'] } } });
  assert.deepEqual(pipeline[2], { $match: { availableAt: { $gt: '2026-10-06T10:00:00.000Z' } } });
  assert.deepEqual(pipeline[3], { $sort: { availableAt: 1 } });
  assert.deepEqual(pipeline[4], { $limit: 50 });
});

test('without a cursor there is no cut', () => {
  assert.equal(stages().length, 4);
  assert.equal(JSON.stringify(stages()).includes('$gt'), false);
});
