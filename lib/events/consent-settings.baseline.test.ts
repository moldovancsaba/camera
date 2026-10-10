/**
 * "Nothing changes until somebody chooses" (issue 558, owner answer 297), proved by running the same inputs through the logic as it was before the checkbox settings
 * (frozen in `baseline/`) and through the logic as it is now: with no setting stored anywhere the answers must be identical, compared as JSON text so that even the order of the
 * fields is the same. The guest pages themselves are held to the same standard by consent-defaults.test.tsx (their markup), the saved photo by the submissions route test.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { acceptanceOnLogin, acceptanceSentence } from './acceptance';
import { chosenDocuments, documentSettings, effectiveCheckboxes } from './checkbox-settings';
import { consentCheckboxes, consentRecords, sanitizeCheckboxes } from './consent';
import { missingRequiredConsent, mayRefuse } from './consent-guard';
import { defaultConsentCheckboxes, defaultConsentPage, withDefaultJourneyPages } from './default-pages';
import { effectiveGalleryConsent, galleryChoice } from './gallery-consent';
import * as oldAcceptance from './baseline/acceptance.baseline';
import * as oldConsent from './baseline/consent.baseline';
import * as oldDefaults from './baseline/default-pages.baseline';
import * as oldGallery from './baseline/gallery-consent.baseline';

const same = (now: unknown, before: unknown, what: string) => assert.equal(JSON.stringify(now), JSON.stringify(before), what);

const NOW = '2026-10-10T10:00:00.000Z';
const page = (pageId: string, pageType: string, order: number, config: Record<string, unknown> = {}, isActive = true) =>
  ({ pageId, pageType, order, isActive, config: { title: pageId, buttonText: 'Go', description: '', ...config }, createdAt: NOW, updatedAt: NOW }) as unknown as CustomPage;

const threeBoxes = [
  { text: 'I accept the Terms and conditions', linkUrl: 'https://seyuselfies.com/en/legal/terms' },
  { text: 'I accept cookies', linkUrl: 'https://seyuselfies.com/en/legal/cookies' },
  { text: 'I have read the Privacy policy', linkUrl: 'https://seyuselfies.com/en/policies' },
];

// Every shape of event pages the journey meets: nothing, an own consent page (single text, list, with and without links), a login page, welcome pages, a take-photo page with and without a Submit page, switched-off pages.
const PAGE_SETS: Record<string, CustomPage[]> = {
  none: [],
  takePhotoOnly: [page('tp', 'take-photo', 0)],
  welcomeTakePhoto: [page('w', 'welcome', -2), page('tp', 'take-photo', 0)],
  ownConsentList: [page('c', 'accept', -2, { checkboxes: threeBoxes }), page('tp', 'take-photo', 0)],
  ownConsentSingle: [page('c', 'accept', -2, { checkboxText: 'I agree' }), page('tp', 'take-photo', 0)],
  ownConsentNoLinks: [page('c', 'accept', -2, { checkboxes: [{ text: 'One' }, { text: 'Two' }] }), page('tp', 'take-photo', 0)],
  ownConsentOff: [page('c', 'accept', -2, { checkboxes: threeBoxes }, false), page('tp', 'take-photo', 0)],
  consentAndLogin: [page('c', 'accept', -3, { checkboxes: threeBoxes }), page('l', 'who-are-you', -2, { nameLabel: 'n', emailLabel: 'e' }), page('tp', 'take-photo', 0)],
  loginOnly: [page('l', 'who-are-you', -2, { nameLabel: 'n', emailLabel: 'e' }), page('tp', 'take-photo', 0)],
  consentAfterPhoto: [page('tp', 'take-photo', 0), page('c', 'accept', 1, { checkboxes: threeBoxes })],
  separateSubmit: [page('c', 'accept', -3, { checkboxes: threeBoxes }), page('tp', 'take-photo', 0), page('l', 'who-are-you', 1, { nameLabel: 'n', emailLabel: 'e' }), page('s', 'submit', 2)],
  twoConsents: [page('c1', 'accept', -3, { checkboxes: threeBoxes }), page('c2', 'accept', -2, { checkboxText: 'Second' }), page('l', 'who-are-you', -1, { nameLabel: 'n', emailLabel: 'e' }), page('tp', 'take-photo', 0)],
};

test('the checkboxes of a consent page, and the records they leave, are the same as before for every list that sets neither "shown" nor "required"', () => {
  const lists: unknown[] = [
    undefined,
    null,
    'text',
    [],
    threeBoxes,
    [{ text: '  spaced   out  ' }, { text: 'ok', linkUrl: 'http://not-https.example' }, { text: '' }, { text: 'x'.repeat(400) }, { notText: 1 }, null, 'str'],
    Array.from({ length: 14 }, (_, i) => ({ text: `Box ${i}`, linkUrl: i % 2 ? `https://example.com/${i}` : undefined })),
  ];
  for (const list of lists) {
    same(sanitizeCheckboxes(list), oldConsent.sanitizeCheckboxes(list), `sanitize ${JSON.stringify(list)?.slice(0, 40)}`);
    for (const single of [undefined, '', '  one box  ']) {
      same(consentCheckboxes({ checkboxes: list, checkboxText: single }), oldConsent.consentCheckboxes({ checkboxes: list, checkboxText: single }), 'list or single text');
    }
  }
  const items = sanitizeCheckboxes(threeBoxes);
  for (const accepted of [true]) {
    for (const shownText of [undefined, '', 'One sentence']) {
      const data = { accepted, acceptedAt: NOW, items, ...(shownText !== undefined ? { shownText } : {}) };
      for (const pageType of ['accept', 'cta'] as const) {
        same(consentRecords({ pageId: 'p', pageType, checkboxText: 'old' }, data), oldConsent.consentRecords({ pageId: 'p', pageType, checkboxText: 'old' }, data), `records ${pageType} ${shownText}`);
      }
    }
  }
  same(consentRecords({ pageId: 'p', pageType: 'cta', checkboxText: 'https://x.example' }, { accepted: true, acceptedAt: NOW, items: [] }), oldConsent.consentRecords({ pageId: 'p', pageType: 'cta', checkboxText: 'https://x.example' }, { accepted: true, acceptedAt: NOW, items: [] }), 'a CTA record');
  same(consentRecords({ pageId: 'p', pageType: 'accept' }, { accepted: true, acceptedAt: NOW }), oldConsent.consentRecords({ pageId: 'p', pageType: 'accept' }, { accepted: true, acceptedAt: NOW }), 'a page with the single text');
});

test('the default consent page and the whole default journey are the same as before when nobody chose anything: with no settings, and with the settings an event that chose nothing gets', () => {
  const nothingChosen = effectiveCheckboxes({}, {});
  assert.equal(chosenDocuments(nothingChosen), undefined, 'an event that chose nothing is handed no settings at all');
  for (const language of ['en', 'hu'] as const) {
    same(defaultConsentCheckboxes(language), oldDefaults.defaultConsentCheckboxes(language), `checkboxes ${language}`);
    same(defaultConsentCheckboxes(language, undefined, documentSettings(nothingChosen)), oldDefaults.defaultConsentCheckboxes(language), `checkboxes ${language} with the standard settings written out`);
    same(defaultConsentPage(-2, NOW, language), oldDefaults.defaultConsentPage(-2, NOW, language), `page ${language}`);
    same(defaultConsentPage(-2, NOW, language, undefined, documentSettings(nothingChosen)), oldDefaults.defaultConsentPage(-2, NOW, language), `page ${language} with the standard settings written out`);
  }
  let compared = 0;
  for (const [name, pages] of Object.entries(PAGE_SETS)) {
    for (const vettingRequired of [false, true]) {
      for (const consentDefault of [false, true]) {
        for (const hasWelcomeScreen of [false, true]) {
          for (const language of ['en', 'hu'] as const) {
            for (const defaultOrders of [undefined, { 'default-consent': -5 }]) {
              const options = { vettingRequired, consentDefault, now: NOW, language, hasWelcomeScreen, defaultOrders };
              const before = oldDefaults.withDefaultJourneyPages(pages, options);
              same(withDefaultJourneyPages(pages, options), before, `${name} ${JSON.stringify(options)}`);
              same(withDefaultJourneyPages(pages, { ...options, documents: documentSettings(nothingChosen) }), before, `${name} with the standard settings written out`);
              compared += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(compared >= 190, `compared ${compared} journeys`);
});

test('the acceptance on the Who-are-you page merges the same page and makes the same sentence as before', () => {
  for (const [name, pages] of Object.entries(PAGE_SETS)) {
    for (const enabled of [false, true]) {
      const active = pages.filter((p) => p.isActive);
      same(acceptanceOnLogin(active, enabled), oldAcceptance.acceptanceOnLogin(active, enabled), `${name} enabled=${enabled}`);
      same(acceptanceOnLogin(pages, enabled), oldAcceptance.acceptanceOnLogin(pages, enabled), `${name} (all pages) enabled=${enabled}`);
    }
  }
  const lists = [sanitizeCheckboxes(threeBoxes), sanitizeCheckboxes(threeBoxes.slice(0, 2)), sanitizeCheckboxes([{ text: 'A' }, { text: 'B', linkUrl: 'https://example.com/b' }]), []];
  for (const language of ['en', 'hu'] as const) {
    for (const list of lists) same(acceptanceSentence(list, language), oldAcceptance.acceptanceSentence(list, language), `sentence ${language} ${list.length}`);
    same(acceptanceSentence(defaultConsentCheckboxes(language), language), oldAcceptance.acceptanceSentence(oldDefaults.defaultConsentCheckboxes(language), language), 'the usual three documents');
  }
});

test('the public gallery permission and the acceptance switch resolve to what the old rules gave, for every combination of event and partner values', () => {
  const values: unknown[] = [undefined, null, true, false, 'true', 1, 0, {}];
  for (const eventValue of values) {
    for (const partnerValue of values) {
      for (const hasPartner of [true, false]) {
        const event = { galleryConsent: eventValue };
        const partner = hasPartner ? { galleryConsent: partnerValue } : null;
        const old = oldGallery.effectiveGalleryConsent(event, partner);
        assert.equal(effectiveGalleryConsent(event, partner), old);
        const now = effectiveCheckboxes(event, partner).gallery;
        assert.equal(now.shown, old, `gallery ${String(eventValue)} / ${String(partnerValue)}`);
        assert.equal(now.required, false, 'asking was always optional');
        assert.equal(now.checked, false, 'and never checked by the server');
      }
    }
  }
  for (const stored of values) {
    // Before the settings only the event had the switch, and only `true` turned it on.
    const now = effectiveCheckboxes({ acceptanceOnWhoAreYou: stored }, null).acceptance;
    assert.equal(now.shown, stored === true, `acceptance ${String(stored)}`);
    if (now.shown) assert.equal(now.required, true, 'and when it is on everything waited for the tick');
    assert.equal(now.checked, false, 'which only the page enforced');
  }
});

test('a saved photo gets the same wall choice and evidence as before for every request, asked or not', () => {
  for (const asked of [false, true]) {
    for (const shareOptIn of [undefined, true, false, 'true']) {
      for (const version of [undefined, 1, 2, '1']) {
        const request = { shareOptIn, publicGalleryConsentVersion: version };
        same(galleryChoice(asked, request, NOW), oldGallery.galleryChoice(asked, request, NOW), `asked=${asked} ${String(shareOptIn)} ${String(version)}`);
        same(galleryChoice(asked, request, NOW, false), oldGallery.galleryChoice(asked, request, NOW), 'not required');
      }
    }
  }
});

test('the server refuses nothing for an event that chose nothing, whatever the request carries: the standard requirements stay with the page, as before (planning item 43)', () => {
  const requests = [
    { consents: [] },
    { consents: [{ pageId: 'default-consent', accepted: true }] },
    { consents: [{ pageId: 'x', accepted: false }, null, 'text'] },
    { consents: [], shareOptIn: false },
  ];
  for (const [name, pages] of Object.entries(PAGE_SETS)) {
    for (const partner of [null, {}, { consentSettings: {} }]) {
      for (const event of [{ customPages: pages }, { customPages: pages, acceptanceOnWhoAreYou: true }, { customPages: pages, acceptanceOnWhoAreYou: false, galleryConsent: true }, { customPages: pages, galleryConsent: false }]) {
        assert.equal(mayRefuse(event, partner), false, `${name}: nothing to check`);
        for (const request of requests) {
          for (const consentDefault of [false, true]) {
            assert.equal(missingRequiredConsent(event, partner, request, { consentDefault, vettingRequired: true }), null, `${name} ${JSON.stringify(request)}`);
          }
        }
      }
    }
  }
});
