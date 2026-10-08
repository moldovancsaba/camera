import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WAITING_REFRESH_MS, shouldRefreshWaiting } from './auto-refresh';

const idle = { status: 'pending_review', hidden: false, deciding: false, rejecting: false };

test('the Waiting list refreshes by itself, and only when nothing is going on that the refresh would disturb', () => {
  assert.equal(shouldRefreshWaiting(idle), true);
  assert.equal(shouldRefreshWaiting({ ...idle, status: 'approved' }), false, 'a decided list does not change');
  assert.equal(shouldRefreshWaiting({ ...idle, status: 'rejected' }), false);
  assert.equal(shouldRefreshWaiting({ ...idle, hidden: true }), false, 'a page that is not on screen does not ask');
  assert.equal(shouldRefreshWaiting({ ...idle, deciding: true }), false, 'not while a decision is in flight');
  assert.equal(shouldRefreshWaiting({ ...idle, rejecting: true }), false, 'not while a reason is being written');
  assert.ok(WAITING_REFRESH_MS >= 5000 && WAITING_REFRESH_MS <= 30000, 'often enough to follow the match, rarely enough to be cheap');
});
