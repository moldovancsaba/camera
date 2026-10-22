import assert from 'node:assert/strict';
import { test } from 'node:test';
import { awaitingGuestContact, draftGuestContact, finalizedGuestContact, guestContactOf, hasFinalizedGuestContact, incompleteContactErasure } from './guest-contact';

test('a completed canonical contact is normalized and is authoritative over legacy mirrors', () => {
  const contact = guestContactOf({
    guestContact: { status: 'complete', source: 'typed_email', name: 'Ann', email: 'Ann@Example.com', completedAt: '2026-10-22T10:00:00Z' },
    userEmail: 'reviewer@example.com',
  });
  assert.equal(contact.status, 'complete');
  assert.equal(contact.email, 'ann@example.com');
  assert.equal(hasFinalizedGuestContact({ guestContact: contact }), true);
});

test('legacy typed contact remains readable, while a partial form stays a draft', () => {
  assert.equal(guestContactOf({ userId: 'anonymous', userInfo: { name: 'Ann', email: 'ann@example.com' } }).status, 'complete');
  assert.equal(guestContactOf({ userId: 'anonymous', userEmail: 'reviewer@example.com', userInfoDraft: { name: 'Ann', updatedAt: 'now' } }).status, 'draft');
  assert.equal(guestContactOf({
    userId: 'anonymous',
    userInfo: { name: 'Old value', email: 'stale@example.com' },
    userInfoDraft: { name: 'Ann', updatedAt: 'now' },
  }).status, 'draft');
  assert.equal(guestContactOf({ userId: 'member-1', userEmail: 'member@example.com', userInfoDraft: {} }).status, 'draft');
  assert.equal(guestContactOf({ userId: 'member-1', userEmail: 'member@example.com', userInfoDraft: null }).status, 'draft');
  assert.equal(hasFinalizedGuestContact({ userId: 'anonymous', userEmail: 'anonymous@event' }), false);
});

test('draft and awaiting states cannot be mistaken for finalized contact', () => {
  assert.equal(awaitingGuestContact('2026-10-22T10:00:00Z').status, 'awaiting_contact');
  assert.equal(draftGuestContact({ name: 'Ann', email: 'invalid', at: '2026-10-22T10:00:00Z' }).email, null);
  assert.equal(hasFinalizedGuestContact({ guestContact: draftGuestContact({ name: 'Ann', email: 'ann@example.com', at: 'now' }) }), false);
  assert.equal(finalizedGuestContact({ name: 'Ann', email: 'Ann@Example.com', source: 'typed_email', at: 'now' }).email, 'ann@example.com');
});

test('incomplete contact receives a 24-hour erasure deadline', () => {
  const result = incompleteContactErasure('2026-10-22T10:00:00.000Z');
  assert.equal(result.status, 'pending_erasure');
  assert.equal(result.retentionExpiresAt, '2026-10-23T10:00:00.000Z');
});
