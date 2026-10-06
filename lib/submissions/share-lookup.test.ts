import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ObjectId } from 'mongodb';
import { findShareSubmission, shareLookupFilter, shareStateOf } from './share-lookup';

const TOKEN = 'abcdefghijklmnopqrstuvwx';

test('a share link is an id, a token, or nothing', () => {
  const oid = new ObjectId();
  assert.deepEqual(shareLookupFilter(oid.toHexString()), { $or: [{ shareToken: oid.toHexString() }, { _id: oid }] }, 'a 24-character hex string is both: either may match');
  assert.deepEqual(shareLookupFilter(TOKEN), { shareToken: TOKEN });
  assert.equal(shareLookupFilter('short'), null);
  assert.equal(shareLookupFilter('has spaces and a $ sign in it...'), null);
  assert.equal(shareLookupFilter(''), null);
});

const lookup = (doc: Record<string, unknown>, byToken: boolean) => ({ doc, byToken });

test('state: approved and legacy photos are visible by id or by token', () => {
  assert.equal(shareStateOf(lookup({ reviewStatus: 'approved' }, true)), 'visible');
  assert.equal(shareStateOf(lookup({ reviewStatus: 'approved', shareToken: TOKEN }, false)), 'visible', 'approved photos keep their id link');
  assert.equal(shareStateOf(lookup({}, false)), 'visible', 'a photo from before vetting has no status');
});

test('state: a waiting or rejected photo is shown only to its token', () => {
  assert.equal(shareStateOf(lookup({ reviewStatus: 'pending_review', shareToken: TOKEN }, true)), 'waiting');
  assert.equal(shareStateOf(lookup({ reviewStatus: 'rejected', shareToken: TOKEN }, true)), 'not_approved');
  assert.equal(shareStateOf(lookup({ reviewStatus: 'pending_review', shareToken: TOKEN }, false)), 'hidden', 'by id nothing is shown');
  assert.equal(shareStateOf(lookup({ reviewStatus: 'rejected', shareToken: TOKEN }, false)), 'hidden');
});

test('state: archived photos, unapproved try-on results and unknown links are hidden', () => {
  assert.equal(shareStateOf(lookup({ reviewStatus: 'pending_review', isArchived: true, shareToken: TOKEN }, true)), 'hidden');
  assert.equal(shareStateOf(lookup({ submissionKind: 'tryon_result', reviewStatus: 'pending_review', shareToken: TOKEN }, true)), 'hidden');
  assert.equal(shareStateOf(lookup({ reviewStatus: 'approved', isArchived: true }, false)), 'hidden');
  assert.equal(shareStateOf(null), 'hidden');
});

test('findShareSubmission asks the database once and says how the photo was found', async () => {
  const doc = { _id: new ObjectId(), shareToken: TOKEN, reviewStatus: 'pending_review' };
  const asked: unknown[] = [];
  const db = { collection: () => ({ findOne: async (filter: unknown) => (asked.push(filter), doc) }) } as never;
  const byToken = await findShareSubmission(db, TOKEN);
  assert.equal(byToken?.byToken, true);
  const byId = await findShareSubmission(db, doc._id.toHexString());
  assert.equal(byId?.byToken, false);
  assert.equal(await findShareSubmission(db, 'nope'), null);
  assert.equal(asked.length, 2, 'an impossible link never reaches the database');
});
