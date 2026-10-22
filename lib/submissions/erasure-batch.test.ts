import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ObjectId } from 'mongodb';
import { prioritizeErasureCandidates } from './erasure-batch';

describe('erasure batch priority', () => {
  it('uses consent erasure candidates before lower-priority identity retries', () => {
    const consent = [{ _id: 'consent-1' }, { _id: 'consent-2' }];
    const identity = [{ _id: 'identity-1' }, { _id: 'identity-2' }];
    assert.deepEqual(prioritizeErasureCandidates(consent, identity, 3), [
      ...consent,
      identity[0],
    ]);
  });

  it('deduplicates candidates that match both filters and respects the batch cap', () => {
    const sharedId = new ObjectId('507f1f77bcf86cd799439011');
    const consent = [{ _id: sharedId, kind: 'consent' }, { _id: 'consent-2', kind: 'consent' }];
    const lower = [{ _id: new ObjectId('507f1f77bcf86cd799439011'), kind: 'identity' }, { _id: 'identity-1', kind: 'identity' }];

    assert.deepEqual(prioritizeErasureCandidates(consent, lower, 3), [
      consent[0],
      consent[1],
      lower[1],
    ]);
    assert.deepEqual(prioritizeErasureCandidates(consent, lower, 0), []);
  });
});
