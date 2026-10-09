import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CustomPageType } from '@/lib/db/schemas';
import { acceptanceOnLogin, acceptanceSentence, sentenceText } from './acceptance';
import { defaultConsentCheckboxes } from './default-pages';

const page = (pageType: CustomPageType, order: number, isActive = true, id = `${pageType}-${order}`) => ({ id, pageType, order, isActive });
const FLOW = [page(CustomPageType.WELCOME, 0), page(CustomPageType.ACCEPT, 1), page(CustomPageType.WHO_ARE_YOU, 2), page(CustomPageType.TAKE_PHOTO, 3), page(CustomPageType.CTA, 4)];

test('off: the pages are exactly as they were, and nothing is merged', () => {
  const out = acceptanceOnLogin(FLOW, false);
  assert.deepEqual(out.pages, FLOW);
  assert.equal(out.acceptPage, null);
});

test('on: the consent page before the photo leaves the list and its checkboxes go to the Who-are-you page; the order of the others is kept', () => {
  const out = acceptanceOnLogin(FLOW, true);
  assert.deepEqual(out.pages.map((p) => p.pageType), ['welcome', 'who-are-you', 'take-photo', 'cta']);
  assert.equal(out.acceptPage?.pageType, 'accept');
});

test('on, but a page it needs is missing or off, or the consent page is after the photo: nothing changes (the user is never left without a consent page)', () => {
  const noLogin = FLOW.filter((p) => p.pageType !== CustomPageType.WHO_ARE_YOU);
  assert.deepEqual(acceptanceOnLogin(noLogin, true).pages, noLogin);
  assert.equal(acceptanceOnLogin(noLogin, true).acceptPage, null);
  const loginOff = FLOW.map((p) => (p.pageType === CustomPageType.WHO_ARE_YOU ? { ...p, isActive: false } : p));
  assert.equal(acceptanceOnLogin(loginOff, true).acceptPage, null);
  const noAccept = FLOW.filter((p) => p.pageType !== CustomPageType.ACCEPT);
  assert.equal(acceptanceOnLogin(noAccept, true).acceptPage, null);
  const acceptAfter = [page(CustomPageType.WHO_ARE_YOU, 1), page(CustomPageType.TAKE_PHOTO, 2), page(CustomPageType.ACCEPT, 3)];
  assert.equal(acceptanceOnLogin(acceptAfter, true).acceptPage, null, 'a consent page after the photo is not a consent for the photo');
});

test('only the first consent page is merged, a second one stays a page of its own; an event with no take-photo page has everything before the photo', () => {
  const two = [page(CustomPageType.ACCEPT, 1, true, 'a'), page(CustomPageType.ACCEPT, 2, true, 'b'), page(CustomPageType.WHO_ARE_YOU, 3)];
  const out = acceptanceOnLogin(two, true);
  assert.equal(out.acceptPage?.id, 'a');
  assert.deepEqual(out.pages.map((p) => p.id), ['b', 'who-are-you-3']);
});

test('the Hungarian sentence is the client\'s sentence, word for word, with each document a link to its own page', () => {
  const items = defaultConsentCheckboxes('hu');
  const parts = acceptanceSentence(items, 'hu');
  assert.equal(sentenceText(parts), 'Elfogadom az Általános Szerződési Feltételeket, tudomásul veszem az Adatkezelési tájékoztatót és a Sütikezelési tájékoztatót');
  const links = parts.filter((p) => p.linkUrl).map((p) => [p.text, p.linkUrl]);
  assert.deepEqual(links, [
    ['Általános Szerződési Feltételeket', 'https://seyuselfies.com/hu/legal/terms'],
    ['Adatkezelési tájékoztatót', 'https://seyuselfies.com/hu/policies'],
    ['Sütikezelési tájékoztatót', 'https://seyuselfies.com/hu/legal/cookies'],
  ]);
});

test('the English sentence names the same three documents with the same links; the editor\'s wording for the event wins', () => {
  const items = defaultConsentCheckboxes('en');
  const parts = acceptanceSentence(items, 'en');
  assert.equal(sentenceText(parts), 'I accept the Terms and conditions, and I acknowledge the Privacy notice and the Cookie notice');
  assert.equal(parts.filter((p) => p.linkUrl).length, 3);
  const own = acceptanceSentence(items, 'en', { 'consent.combined': 'We agree to the {terms}; we read the {privacy} and the {cookies}.' });
  assert.equal(sentenceText(own), 'We agree to the Terms and conditions; we read the Privacy notice and the Cookie notice.');
});

test('a consent page with another list of checkboxes is shown as its own texts one after the other, each with its link, so nothing is left out', () => {
  const parts = acceptanceSentence([{ text: 'I agree to the rules', linkUrl: 'https://example.test/rules' }, { text: 'I am over 16' }], 'en');
  assert.equal(sentenceText(parts), 'I agree to the rules, I am over 16');
  assert.deepEqual(parts.filter((p) => p.linkUrl).map((p) => p.linkUrl), ['https://example.test/rules']);
  assert.equal(sentenceText(acceptanceSentence([], 'en')), '');
});
