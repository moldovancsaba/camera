import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHECKBOX_KINDS,
  STANDARD_CHECKBOXES,
  chosenDocuments,
  documentSettings,
  effectiveCheckboxes,
  modeOf,
  parseCheckboxSettings,
  settingsToStore,
  storedCheckboxSettings,
  type CheckboxMode,
} from './checkbox-settings';

test('the standard of every kind is what the journey always did: the three documents shown and required, the acceptance sentence and the gallery permission not shown', () => {
  const standard = effectiveCheckboxes(null, null);
  assert.deepEqual(standard, STANDARD_CHECKBOXES);
  for (const kind of ['terms', 'cookies', 'privacy'] as const) assert.deepEqual(standard[kind], { shown: true, required: true, checked: false, source: 'standard' });
  assert.equal(standard.acceptance.shown, false);
  assert.equal(standard.gallery.shown, false);
  assert.equal(standard.gallery.required, false, 'asking was always optional');
  assert.equal(chosenDocuments(standard), undefined, 'nothing chosen: no settings are sent along');
  assert.deepEqual(effectiveCheckboxes({}, {}), STANDARD_CHECKBOXES);
  assert.deepEqual(effectiveCheckboxes({ consentSettings: {} }, { consentSettings: null }), STANDARD_CHECKBOXES);
});

test('an event follows its partner, chooses for itself, and a partner that changes its default changes every event that chose nothing; nothing is copied down', () => {
  const partner = { consentSettings: { cookies: { shown: false }, privacy: { shown: true, required: false } }, galleryConsent: true, acceptanceOnWhoAreYou: true };
  const followed = effectiveCheckboxes({}, partner);
  assert.equal(followed.terms.source, 'standard');
  assert.deepEqual(followed.cookies, { shown: false, required: false, checked: false, source: 'partner' });
  assert.deepEqual(followed.privacy, { shown: true, required: false, checked: false, source: 'partner' });
  assert.equal(followed.gallery.shown, true);
  assert.equal(followed.gallery.source, 'partner');
  assert.equal(followed.acceptance.shown, true);
  assert.equal(followed.acceptance.source, 'partner');
  const own = effectiveCheckboxes({ consentSettings: { cookies: { shown: true, required: true } }, galleryConsent: false, acceptanceOnWhoAreYou: false }, partner);
  assert.deepEqual(own.cookies, { shown: true, required: true, checked: true, source: 'event' });
  assert.equal(own.gallery.shown, false, 'the event’s own “do not ask” wins over a partner that asks');
  assert.equal(own.acceptance.shown, false);
  assert.equal(own.privacy.source, 'partner', 'a kind it made no choice for still follows');
  // The partner is read each time: change it and the event that chose nothing changes.
  assert.equal(effectiveCheckboxes({}, { consentSettings: { cookies: { shown: true, required: true } } }).cookies.checked, true);
});

test('the first level that chose decides both settings of a kind: a part it did not set takes the standard, never the partner’s', () => {
  const partner = { consentSettings: { gallery: { required: true }, acceptance: { required: true } }, galleryConsent: true, acceptanceOnWhoAreYou: true };
  const event = { galleryConsent: true, acceptanceOnWhoAreYou: true };
  const result = effectiveCheckboxes(event, partner);
  assert.equal(result.gallery.shown, true);
  assert.equal(result.gallery.required, false, 'the event chose “ask” (optional); its partner’s “required” is not borrowed');
  assert.equal(result.gallery.checked, false);
  assert.equal(result.acceptance.required, true, 'the standard when it is on');
  assert.equal(result.acceptance.checked, false, 'only the page enforces the standard');
  assert.equal(effectiveCheckboxes({}, partner).gallery.required, true);
  assert.equal(effectiveCheckboxes({}, partner).gallery.checked, true, 'a required gallery permission is always an editor’s choice, so the server checks it');
});

test('what an editor chose to require is checked by the server; the standard requirement and an optional or switched-off checkbox are not', () => {
  const chosen = effectiveCheckboxes({ consentSettings: { terms: { shown: true, required: true }, cookies: { shown: true, required: false }, privacy: { shown: false }, acceptance: { required: true } }, acceptanceOnWhoAreYou: true }, null);
  assert.equal(chosen.terms.checked, true);
  assert.equal(chosen.cookies.checked, false, 'optional');
  assert.equal(chosen.privacy.checked, false, 'off');
  assert.equal(chosen.acceptance.checked, true);
  const legacy = effectiveCheckboxes({ acceptanceOnWhoAreYou: true }, null);
  assert.equal(legacy.acceptance.required, true);
  assert.equal(legacy.acceptance.checked, false, 'an acceptance switched on before the settings existed keeps its page-only guard until somebody chooses');
});

test('what is stored is read defensively: only known kinds and true/false parts count', () => {
  assert.deepEqual(storedCheckboxSettings({ terms: { shown: 'no', required: true, extra: 1 }, wat: { shown: true }, gallery: { required: 'yes' }, acceptance: { required: false } }), { terms: { required: true }, acceptance: { required: false } });
  assert.deepEqual(storedCheckboxSettings('garbage'), {});
  assert.deepEqual(storedCheckboxSettings(null), {});
});

test('a request for consentSettings is refused when it names an unknown kind or setting or a value that is not true or false; empty means no choice', () => {
  assert.deepEqual(parseCheckboxSettings(null), { ok: true, value: null });
  assert.deepEqual(parseCheckboxSettings(''), { ok: true, value: null });
  assert.deepEqual(parseCheckboxSettings({}), { ok: true, value: null });
  assert.deepEqual(parseCheckboxSettings({ terms: {} }), { ok: true, value: null });
  assert.deepEqual(parseCheckboxSettings({ terms: { shown: false }, gallery: { required: true } }), { ok: true, value: { terms: { shown: false }, gallery: { required: true } } });
  for (const bad of ['text', 1, [], { newsletter: { shown: true } }, { terms: 'on' }, { terms: { shown: 'yes' } }, { terms: { visible: true } }, { gallery: { shown: true } }, { acceptance: { shown: true } }, { privacy: [] }]) {
    assert.equal(parseCheckboxSettings(bad).ok, false, JSON.stringify(bad));
  }
});

test('every mode of every kind is stored and read back as the same mode', () => {
  const modes: CheckboxMode[] = ['', 'required', 'optional', 'off'];
  for (const kind of CHECKBOX_KINDS) {
    for (const mode of modes) {
      const stored = settingsToStore({ [kind]: mode });
      const holder = { galleryConsent: stored.galleryConsent, acceptanceOnWhoAreYou: stored.acceptanceOnWhoAreYou, consentSettings: stored.consentSettings };
      assert.equal(modeOf(holder, kind), mode, `${kind} ${mode}`);
      for (const other of CHECKBOX_KINDS) if (other !== kind) assert.equal(modeOf(holder, other), '', `${kind} ${mode} leaves ${other} alone`);
    }
  }
  // “Ask” of the public gallery permission is stored the way it was before, as galleryConsent true and nothing else.
  assert.deepEqual(settingsToStore({ gallery: 'optional' }), { galleryConsent: true, acceptanceOnWhoAreYou: null, consentSettings: null });
  assert.deepEqual(settingsToStore({ gallery: 'off' }), { galleryConsent: false, acceptanceOnWhoAreYou: null, consentSettings: null });
  assert.deepEqual(settingsToStore({}), { galleryConsent: null, acceptanceOnWhoAreYou: null, consentSettings: null });
});

test('a chosen mode reaches the default consent page as the settings of its documents', () => {
  const stored = settingsToStore({ terms: 'required', cookies: 'off', privacy: 'optional' });
  const effective = effectiveCheckboxes({ consentSettings: stored.consentSettings }, null);
  const docs = chosenDocuments(effective);
  assert.ok(docs);
  assert.equal(docs.terms.checked, true);
  assert.equal(docs.cookies.shown, false);
  assert.equal(docs.privacy.required, false);
  assert.deepEqual(docs, documentSettings(effective));
});
