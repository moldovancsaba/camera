import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GALLERY_CONSENT_VERSION, effectiveGalleryConsent, galleryChoice, parseGalleryConsent } from './gallery-consent';

test('an event asks when it says so, else when its partner does, else it does not (the terms cover it); anything that is not a true or false is no choice', () => {
  assert.equal(effectiveGalleryConsent(null), false);
  assert.equal(effectiveGalleryConsent({}, {}), false);
  assert.equal(effectiveGalleryConsent({}, { galleryConsent: true }), true);
  assert.equal(effectiveGalleryConsent({ galleryConsent: false }, { galleryConsent: true }), false, 'the event’s own choice wins, also not to ask');
  assert.equal(effectiveGalleryConsent({ galleryConsent: true }, { galleryConsent: false }), true);
  assert.equal(effectiveGalleryConsent({ galleryConsent: null }, { galleryConsent: true }), true, 'null follows the partner');
  assert.equal(effectiveGalleryConsent({ galleryConsent: 'yes' }, { galleryConsent: 1 }), false);
});

test('a request value is true, false, or empty/null for no choice; anything else is refused', () => {
  assert.deepEqual(parseGalleryConsent(true), { ok: true, value: true });
  assert.deepEqual(parseGalleryConsent(false), { ok: true, value: false });
  assert.deepEqual(parseGalleryConsent(null), { ok: true, value: null });
  assert.deepEqual(parseGalleryConsent(''), { ok: true, value: null });
  for (const bad of ['true', 'yes', 1, 0, {}, []]) assert.equal(parseGalleryConsent(bad).ok, false, String(bad));
});

test('when the event asks only a ticked box (with the version of the sentence) makes the photo eligible, and it leaves evidence; an old page that sends only shareOptIn true does not', () => {
  const now = '2026-10-10T18:00:00.000Z';
  assert.deepEqual(galleryChoice(true, { shareOptIn: true, publicGalleryConsentVersion: GALLERY_CONSENT_VERSION }, now), { shareOptIn: true, consent: { version: 1, grantedAt: now } });
  assert.deepEqual(galleryChoice(true, { shareOptIn: false, publicGalleryConsentVersion: 1 }, now), { shareOptIn: false, consent: null });
  assert.deepEqual(galleryChoice(true, { shareOptIn: true }, now), { shareOptIn: false, consent: null }, 'no version, no permission');
  assert.deepEqual(galleryChoice(true, { shareOptIn: true, publicGalleryConsentVersion: 2 }, now), { shareOptIn: false, consent: null }, 'a version this server does not know is not accepted');
  assert.deepEqual(galleryChoice(true, {}, now), { shareOptIn: false, consent: null });
});

test('when the event does not ask the page decides as it always did, and a ticked box still leaves its evidence', () => {
  const now = '2026-10-10T18:00:00.000Z';
  assert.deepEqual(galleryChoice(false, { shareOptIn: true }, now), { shareOptIn: true, consent: null });
  assert.deepEqual(galleryChoice(false, { shareOptIn: false }, now), { shareOptIn: false, consent: null });
  assert.deepEqual(galleryChoice(false, {}, now), { shareOptIn: false, consent: null }, 'a request that omits it stores false, as before');
  assert.deepEqual(galleryChoice(false, { shareOptIn: true, publicGalleryConsentVersion: 1 }, now), { shareOptIn: true, consent: { version: 1, grantedAt: now } });
});
