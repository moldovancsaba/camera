import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { DEFAULT_IDENTITY_PAGE_ID, DEFAULT_IDENTITY_TEXTS, defaultIdentityPage, hasIdentityPageBeforePhoto, loginOptions, textOrDefault, withRequiredIdentityPage } from './identity-page';

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

test('the default login page comes first, before any page the event has, except a consent page: consent comes before the login', () => {
  const pages = [page('cta', 0), page('take-photo', 1)];
  const result = withRequiredIdentityPage(pages, true);
  assert.equal(result[0].pageId, DEFAULT_IDENTITY_PAGE_ID);
  assert.ok(result[0].order < 0);
  assert.deepEqual(result.slice(1), pages, 'the event pages are untouched');
  const withConsent = [page('accept', 0), page('take-photo', 1)];
  const after = withRequiredIdentityPage(withConsent, true).sort((a, b) => a.order - b.order);
  assert.deepEqual(after.map((p) => p.pageType), ['accept', 'who-are-you', 'take-photo']);
  assert.deepEqual(after.filter((p) => p.pageId !== DEFAULT_IDENTITY_PAGE_ID), withConsent, 'the event pages are untouched');
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

test('the welcome step stays first: the default login step goes right after it and after the consent page, not before them', () => {
  const pages = [page('take-photo', 0), page('welcome', -3), page('accept', -1)];
  const result = withRequiredIdentityPage(pages, true).sort((a, b) => a.order - b.order);
  assert.deepEqual(result.map((p) => p.pageType), ['welcome', 'accept', 'who-are-you', 'take-photo']);
  assert.equal(result[2].pageId, DEFAULT_IDENTITY_PAGE_ID);
  const twoWelcome = withRequiredIdentityPage([page('welcome', 0), page('welcome', 1), page('take-photo', 2)], true).sort((a, b) => a.order - b.order);
  assert.deepEqual(twoWelcome.map((p) => p.pageType), ['welcome', 'welcome', 'who-are-you', 'take-photo']);
  assert.equal(hasIdentityPageBeforePhoto([page('welcome', 0), page('take-photo', 1)]), false, 'a welcome step is not a login');
  assert.equal(withRequiredIdentityPage([page('welcome', 0), page('who-are-you', 1), page('take-photo', 2)], true).length, 3, 'an event with its own login keeps it');
});

test('at least one way to say who you are stays on: with both switched off the default, both on, applies (planning item 36)', () => {
  assert.deepEqual(loginOptions({ enableSSOLogin: true, enablePseudoReg: true }), { sso: true, form: true });
  assert.deepEqual(loginOptions({ enableSSOLogin: true, enablePseudoReg: false }), { sso: true, form: false });
  assert.deepEqual(loginOptions({ enableSSOLogin: false, enablePseudoReg: true }), { sso: false, form: true });
  assert.deepEqual(loginOptions({ enableSSOLogin: false, enablePseudoReg: false }), { sso: true, form: true });
  assert.deepEqual(loginOptions({}), { sso: false, form: true }, 'a page that sets neither keeps the older defaults');
  assert.deepEqual(loginOptions({ enablePseudoReg: false }), { sso: true, form: true }, 'social login off by default and the form off: nothing would be left');
});

test('an empty text falls back to its default text, and the default login page uses those same words', () => {
  assert.equal(textOrDefault('', 'Fallback'), 'Fallback');
  assert.equal(textOrDefault('   ', 'Fallback'), 'Fallback');
  assert.equal(textOrDefault(undefined, 'Fallback'), 'Fallback');
  assert.equal(textOrDefault(null, 'Fallback'), 'Fallback');
  assert.equal(textOrDefault('Own text', 'Fallback'), 'Own text');
  const config = defaultIdentityPage(0, 'T').config as unknown as Record<string, string>;
  assert.equal(config.title, DEFAULT_IDENTITY_TEXTS.title);
  assert.equal(config.buttonText, DEFAULT_IDENTITY_TEXTS.buttonText);
  assert.equal(config.nameLabel, DEFAULT_IDENTITY_TEXTS.nameLabel);
  assert.equal(config.description, DEFAULT_IDENTITY_TEXTS.description);
});

