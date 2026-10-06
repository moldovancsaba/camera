import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { dispatchPendingSubmissionEmailForSubmission } from './submission-result-email';

// The database is never touched: a photo that is not approved is turned away before any lookup.
const noDatabase = new Proxy({}, { get: () => { throw new Error('the database must not be used'); } }) as never;

test('the generic email dispatcher sends nothing for a pending or rejected photo', async () => {
  for (const reviewStatus of ['pending_review', 'rejected']) {
    const result = await dispatchPendingSubmissionEmailForSubmission(noDatabase, { _id: new ObjectId(), reviewStatus } as never);
    assert.equal(result, null);
  }
});
