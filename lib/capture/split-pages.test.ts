import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { splitCustomPages } from './split-pages';

const page = (pageType: string, order: number, isActive = true): CustomPage =>
  ({ pageId: `${pageType}-${order}`, pageType, order, isActive, config: { title: pageType, description: '', buttonText: 'Next' }, createdAt: 'x', updatedAt: 'x' }) as unknown as CustomPage;
const ids = (pages: CustomPage[]) => pages.map((p) => p.pageId);

test('without a submit page the split is what it always was: before the photo, and after it', () => {
  const s = splitCustomPages([page('cta', 2), page('welcome', -1), page('take-photo', 0), page('who-are-you', 1)]);
  assert.deepEqual(ids(s.onboardingPages), ['welcome--1']);
  assert.deepEqual(ids(s.presubmitPages), []);
  assert.deepEqual(ids(s.thankYouPages), ['who-are-you-1', 'cta-2']);
  assert.equal(s.takePhotoPage?.pageId, 'take-photo-0');
  assert.equal(s.submitSeparate, false);
});

test('a submit page after the take-photo page splits the pages after the photo: before the save, and after it', () => {
  const s = splitCustomPages([page('welcome', -1), page('take-photo', 0), page('who-are-you', 1), page('cta', 2), page('submit', 3), page('restart', 4)]);
  assert.deepEqual(ids(s.onboardingPages), ['welcome--1']);
  assert.deepEqual(ids(s.presubmitPages), ['who-are-you-1', 'cta-2']);
  assert.deepEqual(ids(s.thankYouPages), ['restart-4']);
  assert.equal(s.submitSeparate, true);
});

test('a submit page right after the photo has nothing between: saving is a step of its own with no page before it', () => {
  const s = splitCustomPages([page('take-photo', 0), page('submit', 1), page('cta', 2)]);
  assert.deepEqual(ids(s.presubmitPages), []);
  assert.deepEqual(ids(s.thankYouPages), ['cta-2']);
  assert.equal(s.submitSeparate, true);
});

test('a submit page that is switched off, before the photo, or in an event with no take-photo page does not count, and is never a page the user sees', () => {
  const off = splitCustomPages([page('take-photo', 0), page('cta', 1), page('submit', 2, false), page('restart', 3)]);
  assert.equal(off.submitSeparate, false);
  assert.deepEqual(ids(off.thankYouPages), ['cta-1', 'restart-3'], 'the switched off marker is not shown');
  const before = splitCustomPages([page('submit', -1), page('welcome', -2), page('take-photo', 0)]);
  assert.equal(before.submitSeparate, false);
  assert.deepEqual(ids(before.onboardingPages), ['welcome--2']);
  const none = splitCustomPages([page('welcome', 0), page('submit', 1), page('accept', 2)]);
  assert.deepEqual(ids(none.onboardingPages), ['welcome-0', 'accept-2']);
  assert.equal(none.submitSeparate, false);
});
