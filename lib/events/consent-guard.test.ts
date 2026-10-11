import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomPage } from '@/lib/db/schemas';
import { CONSENT_MISSING_MESSAGE, GALLERY_MISSING_MESSAGE, mayRefuse, missingRequiredConsent } from './consent-guard';

const page = (pageId: string, pageType: string, order: number, config: Record<string, unknown> = {}, isActive = true) =>
  ({ pageId, pageType, order, isActive, config: { title: pageId, buttonText: 'Go', description: '', ...config }, createdAt: 'x', updatedAt: 'x' }) as unknown as CustomPage;
const LOGIN = page('login', 'who-are-you', -1, { nameLabel: 'n', emailLabel: 'e' });
const PHOTO = page('tp', 'take-photo', 0);
const accepted = (pageId: string, count: number) => Array.from({ length: count }, () => ({ pageId, accepted: true }));
const context = { consentDefault: false, vettingRequired: false };
const ask = (event: Record<string, unknown>, consents: unknown[], more: Record<string, unknown> = {}, ctx = context, partner: Record<string, unknown> | null = null) =>
  missingRequiredConsent(event, partner, { consents, ...more }, ctx);

test('an own consent page whose checkboxes an editor marked required is checked by the server: one accepted record for each', () => {
  const own = page('c', 'accept', -2, { checkboxes: [{ text: 'A', required: true }, { text: 'B', required: true }, { text: 'C', required: false }, { text: 'D' }] });
  const event = { customPages: [own, PHOTO] };
  assert.equal(mayRefuse(event), true);
  assert.equal(ask(event, []), CONSENT_MISSING_MESSAGE);
  assert.equal(ask(event, accepted('c', 1)), CONSENT_MISSING_MESSAGE);
  assert.equal(ask(event, accepted('c', 2)), null);
  assert.equal(ask(event, accepted('c', 4)), null);
  assert.equal(ask(event, [...accepted('other', 5), { pageId: 'c', accepted: false }, { pageId: 'c', accepted: false }]), CONSENT_MISSING_MESSAGE, 'records of another page, or not ticked, do not count');
});

test('the count is compared, not the text, so a word corrected while a user is on the page does not stop their save', () => {
  const event = { customPages: [page('c', 'accept', -2, { checkboxes: [{ text: 'Corrected wording', required: true }] }), PHOTO] };
  assert.equal(ask(event, [{ pageId: 'c', accepted: true, checkboxText: 'The old wording' } as { pageId: string; accepted: boolean }]), null);
});

test('a switched-off checkbox needs no record, and an optional one may stay unticked', () => {
  const event = { customPages: [page('c', 'accept', -2, { checkboxes: [{ text: 'A', required: true }, { text: 'B', required: true, shown: false }, { text: 'C', required: false }] }), PHOTO] };
  assert.equal(ask(event, accepted('c', 1)), null);
  assert.equal(ask(event, []), CONSENT_MISSING_MESSAGE);
});

test('the standard requirement is not checked by the server: an own page that never stored a choice, and the default page, behave as before', () => {
  const own = { customPages: [page('c', 'accept', -2, { checkboxes: [{ text: 'A' }, { text: 'B' }] }), PHOTO] };
  assert.equal(mayRefuse(own), false);
  assert.equal(ask(own, []), null);
  assert.equal(ask({ customPages: [PHOTO] }, [], {}, { consentDefault: true, vettingRequired: false }), null);
  // ...until the owner decides to enforce them too (the one switch in consent-guard.ts).
  assert.equal(missingRequiredConsent(own, null, { consents: [] }, context, true), CONSENT_MISSING_MESSAGE);
  assert.equal(mayRefuse(own, null, true), true);
});

test('the default consent page: a document an editor chose to require at the event or at the partner must have its record; the others do not', () => {
  const event = { customPages: [PHOTO], consentSettings: { terms: { shown: true, required: true } } };
  const withDefaults = { consentDefault: true, vettingRequired: false };
  assert.equal(mayRefuse(event), true);
  assert.equal(ask(event, [], {}, withDefaults), CONSENT_MISSING_MESSAGE);
  assert.equal(ask(event, accepted('default-consent', 1), {}, withDefaults), null);
  assert.equal(ask(event, [], {}, { consentDefault: false, vettingRequired: false }), null, 'an event that does not get the defaults has no default page to require');
  const viaPartner = ask({ customPages: [PHOTO] }, [], {}, withDefaults, { consentSettings: { cookies: { shown: true, required: true }, privacy: { shown: true, required: true } } });
  assert.equal(viaPartner, CONSENT_MISSING_MESSAGE);
  assert.equal(ask({ customPages: [PHOTO] }, accepted('default-consent', 2), {}, withDefaults, { consentSettings: { cookies: { shown: true, required: true }, privacy: { shown: true, required: true } } }), null);
  const off = { customPages: [PHOTO], consentSettings: { terms: { shown: false }, cookies: { shown: false }, privacy: { shown: false } } };
  assert.equal(ask(off, [], {}, withDefaults), null, 'all three off: nothing to accept');
});

test('the acceptance sentence on the Who-are-you page, when an editor chose it required, needs a record for every checkbox it stands for', () => {
  const consent = page('c', 'accept', -3, { checkboxes: [{ text: 'A' }, { text: 'B' }, { text: 'C', shown: false }] });
  const event = { customPages: [consent, LOGIN, PHOTO], acceptanceOnWhoAreYou: true, consentSettings: { acceptance: { required: true } } };
  assert.equal(ask(event, []), CONSENT_MISSING_MESSAGE);
  assert.equal(ask(event, accepted('c', 1)), CONSENT_MISSING_MESSAGE);
  assert.equal(ask(event, accepted('c', 2)), null, 'the two checkboxes that are shown');
  const optional = { ...event, consentSettings: { acceptance: { required: false } } };
  assert.equal(mayRefuse(optional), false);
  assert.equal(ask(optional, []), null);
  const legacy = { customPages: [consent, LOGIN, PHOTO], acceptanceOnWhoAreYou: true };
  assert.equal(ask(legacy, []), null, 'an acceptance switched on before the settings keeps its page-only guard');
  const notMerged = { customPages: [consent, PHOTO], acceptanceOnWhoAreYou: true, consentSettings: { acceptance: { required: true } } };
  assert.equal(ask(notMerged, []), null, 'without a Who-are-you page the acceptance does not apply and the consent page keeps its own checkboxes');
});

test('the public gallery permission set to required needs the ticked box and the version of its sentence', () => {
  const event = { customPages: [PHOTO], galleryConsent: true, consentSettings: { gallery: { required: true } } };
  assert.equal(mayRefuse(event), true);
  assert.equal(ask(event, []), GALLERY_MISSING_MESSAGE);
  assert.equal(ask(event, [], { shareOptIn: true }), GALLERY_MISSING_MESSAGE, 'an old page that sends only shareOptIn');
  assert.equal(ask(event, [], { shareOptIn: false, publicGalleryConsentVersion: 1 }), GALLERY_MISSING_MESSAGE);
  assert.equal(ask(event, [], { shareOptIn: true, publicGalleryConsentVersion: 1 }), null);
  const optional = { customPages: [PHOTO], galleryConsent: true };
  assert.equal(mayRefuse(optional), false);
  assert.equal(ask(optional, []), null, 'asking was always optional');
  assert.equal(ask({ customPages: [PHOTO], consentSettings: { gallery: { required: true } } }, []), null, 'required means nothing when it does not ask');
});

test('a consent page after the photo, a switched-off page and records that are not records change nothing', () => {
  const afterPhoto = { customPages: [PHOTO, page('c', 'accept', 1, { checkboxes: [{ text: 'A', required: true }] })] };
  assert.equal(ask(afterPhoto, []), null, 'after the save');
  const off = { customPages: [page('c', 'accept', -2, { checkboxes: [{ text: 'A', required: true }] }, false), PHOTO] };
  assert.equal(ask(off, []), null);
  const before = { customPages: [page('c', 'accept', -2, { checkboxes: [{ text: 'A', required: true }] }), PHOTO] };
  assert.equal(ask(before, [null, 'x', {}]), CONSENT_MISSING_MESSAGE);
  assert.equal(ask({ customPages: [PHOTO, page('c', 'accept', 1, { checkboxes: [{ text: 'A', required: true }] }), page('s', 'submit', 2)] }, []), CONSENT_MISSING_MESSAGE, 'between the photo and the save it is before the save');
  assert.equal(ask({ customPages: [page('c', 'accept', -2, { checkboxes: [{ text: 'A', required: true }] }), PHOTO, page('s', 'submit', 2)] }, []), CONSENT_MISSING_MESSAGE, 'before the photo with a Submit page: still before the save');
});
