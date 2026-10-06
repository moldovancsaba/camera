import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { DEFAULT_IDENTITY_PAGE_ID, hasIdentityPageBeforePhoto, withRequiredIdentityPage } from './identity-page';

const page = (pageType: string, order: number, isActive = true): CustomPage =>
  ({ pageId: `${pageType}-${order}`, pageType, order, isActive, config: { title: 't', description: 'd', buttonText: 'b' }, createdAt: 'x', updatedAt: 'x' }) as unknown as CustomPage;

test('an event with no pages at all gets the default identity page when vetting is required, and only then', () => {
  const vetted = withRequiredIdentityPage([], true, 'T');
  assert.equal(vetted.length, 1);
  assert.equal(vetted[0].pageId, DEFAULT_IDENTITY_PAGE_ID);
  assert.equal(vetted[0].pageType, 'who-are-you');
  assert.equal(vetted[0].config.enableSSOLogin, true, 'a social login');
  assert.equal(vetted[0].config.enablePseudoReg, true, 'or an email');
  assert.deepEqual(withRequiredIdentityPage([], false), []);
  assert.deepEqual(withRequiredIdentityPage(undefined, false), []);
  assert.equal(withRequiredIdentityPage(null, true).length, 1);
});

test('the default page comes first, before any page the event has', () => {
  const pages = [page('accept', 0), page('take-photo', 1)];
  const result = withRequiredIdentityPage(pages, true);
  assert.equal(result[0].pageId, DEFAULT_IDENTITY_PAGE_ID);
  assert.ok(result[0].order < 0);
  assert.deepEqual(result.slice(1), pages, 'the event pages are untouched');
});

test('an event that already asks before the photo keeps its own page and gets no second one', () => {
  assert.equal(withRequiredIdentityPage([page('who-are-you', 0), page('take-photo', 1)], true).length, 2);
  assert.equal(withRequiredIdentityPage([page('accept', 0), page('who-are-you', 1)], true).length, 2, 'no take-photo page: everything is before the photo');
});

test('a who-are-you page after the photo, or an inactive one, does not count', () => {
  assert.equal(hasIdentityPageBeforePhoto([page('take-photo', 0), page('who-are-you', 1)]), false);
  assert.equal(hasIdentityPageBeforePhoto([page('who-are-you', 0, false), page('take-photo', 1)]), false);
  assert.equal(withRequiredIdentityPage([page('take-photo', 0), page('who-are-you', 1)], true).length, 3);
  assert.equal(withRequiredIdentityPage([page('who-are-you', 0, false)], true)[0].pageId, DEFAULT_IDENTITY_PAGE_ID);
});

test('the input list is not changed', () => {
  const pages = [page('accept', 0)];
  withRequiredIdentityPage(pages, true);
  assert.equal(pages.length, 1);
});
