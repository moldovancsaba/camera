import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { DEFAULT_CONSENT_CHECKBOXES, DEFAULT_CONSENT_PAGE_ID, defaultConsentPage, hasConsentPageBeforePhoto, withDefaultJourneyPages } from './default-pages';
import { DEFAULT_IDENTITY_PAGE_ID } from './identity-page';

const page = (pageType: string, order: number, isActive = true, pageId = `${pageType}-${order}`): CustomPage =>
  ({ pageId, pageType, order, isActive, config: { title: pageType, description: '', buttonText: 'Next' }, createdAt: 'x', updatedAt: 'x' }) as unknown as CustomPage;
const sequence = (pages: CustomPage[]) => [...pages].sort((a, b) => a.order - b.order).map((p) => p.pageId);
const OPTIONS = { now: '2026-10-08T10:00:00.000Z' };

test('the default consent page has the three required checkboxes with their legal pages, in English', () => {
  const consent = defaultConsentPage(0, OPTIONS.now);
  assert.equal(consent.pageType, 'accept');
  const list = (consent.config as { checkboxes: Array<{ text: string; linkUrl: string }> }).checkboxes;
  assert.deepEqual(list.map((c) => c.linkUrl), ['https://seyuselfies.com/en/legal/terms', 'https://seyuselfies.com/en/legal/cookies', 'https://seyuselfies.com/en/policies']);
  assert.deepEqual(list.map((c) => c.text), ['I accept the Terms and conditions', 'I accept cookies', 'I have read the Privacy policy']);
  assert.equal(DEFAULT_CONSENT_CHECKBOXES.length, 3);
  list[0].text = 'changed';
  assert.equal(DEFAULT_CONSENT_CHECKBOXES[0].text, 'I accept the Terms and conditions', 'each page gets its own copy');
});

test('the default order is welcome, consent, login, selfie taking, the rest', () => {
  const own = [page('welcome', -1), page('take-photo', 0), page('cta', 1)];
  assert.deepEqual(sequence(withDefaultJourneyPages(own, { vettingRequired: true, consentDefault: true, ...OPTIONS })), ['welcome--1', DEFAULT_CONSENT_PAGE_ID, DEFAULT_IDENTITY_PAGE_ID, 'take-photo-0', 'cta-1']);
});

test('with no welcome page the consent page is first and the login page second', () => {
  const own = [page('take-photo', 0)];
  assert.deepEqual(sequence(withDefaultJourneyPages(own, { vettingRequired: true, consentDefault: true, ...OPTIONS })), [DEFAULT_CONSENT_PAGE_ID, DEFAULT_IDENTITY_PAGE_ID, 'take-photo-0']);
  assert.deepEqual(sequence(withDefaultJourneyPages([], { vettingRequired: true, consentDefault: true, ...OPTIONS })), [DEFAULT_CONSENT_PAGE_ID, DEFAULT_IDENTITY_PAGE_ID]);
});

test("an event that does not get the defaults is left exactly as it is; vetting alone still adds the login page as before", () => {
  const own = [page('welcome', -1), page('take-photo', 0)];
  assert.deepEqual(withDefaultJourneyPages(own, { vettingRequired: false, consentDefault: false, ...OPTIONS }), own);
  assert.deepEqual(sequence(withDefaultJourneyPages(own, { vettingRequired: true, consentDefault: false, ...OPTIONS })), ['welcome--1', DEFAULT_IDENTITY_PAGE_ID, 'take-photo-0']);
});

test("an event's own consent page before the photo is kept and no default consent page is added; the login page goes after it", () => {
  const own = [page('welcome', -1), page('accept', 0, true, 'own-consent'), page('take-photo', 1)];
  assert.equal(hasConsentPageBeforePhoto(own), true);
  const pages = withDefaultJourneyPages(own, { vettingRequired: true, consentDefault: true, ...OPTIONS });
  assert.deepEqual(sequence(pages), ['welcome--1', 'own-consent', DEFAULT_IDENTITY_PAGE_ID, 'take-photo-1']);
  assert.equal(pages.some((p) => p.pageId === DEFAULT_CONSENT_PAGE_ID), false);
});

test('a consent page after the photo, or one that is switched off, is not a consent page before the photo', () => {
  assert.equal(hasConsentPageBeforePhoto([page('take-photo', 0), page('accept', 1)]), false);
  assert.equal(hasConsentPageBeforePhoto([page('accept', 0, false)]), false);
  const pages = withDefaultJourneyPages([page('take-photo', 0), page('accept', 1)], { vettingRequired: false, consentDefault: true, ...OPTIONS });
  assert.deepEqual(sequence(pages), [DEFAULT_CONSENT_PAGE_ID, 'take-photo-0', 'accept-1']);
});

test("the user's own login page before the photo is kept: only the consent page is added", () => {
  const own = [page('welcome', -1), page('who-are-you', 0, true, 'own-login'), page('take-photo', 1)];
  assert.deepEqual(sequence(withDefaultJourneyPages(own, { vettingRequired: true, consentDefault: true, ...OPTIONS })), ['welcome--1', DEFAULT_CONSENT_PAGE_ID, 'own-login', 'take-photo-1']);
});

test('the pages of the event are never changed or removed, only added to', () => {
  const own = [page('welcome', -1), page('cta', 2)];
  const copy = JSON.stringify(own);
  const result = withDefaultJourneyPages(own, { vettingRequired: true, consentDefault: true, ...OPTIONS });
  assert.equal(JSON.stringify(own), copy);
  for (const original of own) assert.ok(result.includes(original));
});
