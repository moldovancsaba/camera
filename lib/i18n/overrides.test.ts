import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { textOr, translate } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages.en';
import { TEXT_MAX, getGlobalTexts, loadEventTexts, markersOf, mergeOverrides, overridesFor, parseTexts, saveEventTexts, saveGlobalTexts, savePartnerTexts, storedTexts } from './overrides';

const NOW = '2026-10-09T12:00:00.000Z';

test('a wording is plain text for a key and a language of the dictionary; an empty text means no wording at this level', () => {
  const ok = parseTexts({ en: { 'welcome.button': '  Kick   off  ', 'camera.takePhoto': '' }, hu: { 'welcome.button': 'Indulás' } });
  assert.deepEqual(ok, { ok: true, value: { en: { 'welcome.button': 'Kick off' }, hu: { 'welcome.button': 'Indulás' } } });
  assert.deepEqual(parseTexts(null), { ok: true, value: {} });
  assert.deepEqual(parseTexts({ en: {} }), { ok: true, value: {} }, 'a language with nothing written is left out');
});

test('what is refused: an unknown language or key, not text, too long, markup, a changed {marker}', () => {
  const refused = (input: unknown) => {
    const result = parseTexts(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    return result.ok ? '' : result.error;
  };
  refused('x');
  refused([]);
  assert.match(refused({ de: {} }), /Unknown language/);
  assert.match(refused({ en: { 'no.such.key': 'x' } }), /Unknown text/);
  assert.match(refused({ en: { 'welcome.button': 5 } }), /must be text/);
  assert.match(refused({ en: { 'welcome.button': 'x'.repeat(TEXT_MAX + 1) } }), /longer than/);
  assert.match(refused({ en: { 'welcome.button': '<b>Start</b>' } }), /plain text/);
  const withMarker = Object.entries(en).find(([, text]) => /\{\w+\}/.test(text));
  assert.ok(withMarker, 'the dictionary has a text with a marker');
  assert.match(refused({ en: { [withMarker![0]]: 'no marker here' } }), /must keep/);
  assert.equal(parseTexts({ en: { [withMarker![0]]: withMarker![1] } }).ok, true, 'the same markers are fine, in any wording around them');
});

test('markers are read as a sorted set', () => {
  assert.deepEqual(markersOf('Photo of {name} from {event}, again {name}'), ['event', 'name']);
  assert.deepEqual(markersOf('no markers'), []);
});

test('levels merge lowest first: global, then the partner, then the event; a key a level does not have is taken from below', () => {
  const global = { en: { 'welcome.button': 'Go', 'welcome.title': 'Hi' } };
  const partner = { en: { 'welcome.button': 'Kick off' } };
  const event = { en: { 'welcome.title': 'Match day' }, hu: { 'welcome.title': 'Meccsnap' } };
  assert.deepEqual(overridesFor('en', global, partner, event), { 'welcome.button': 'Kick off', 'welcome.title': 'Match day' });
  assert.deepEqual(overridesFor('hu', global, partner, event), { 'welcome.title': 'Meccsnap' });
  assert.deepEqual(overridesFor('en', undefined, null), {});
  assert.deepEqual(mergeOverrides({ 'welcome.button': 'a' }, undefined, { 'welcome.button': 'b' }), { 'welcome.button': 'b' });
});

test('translate and textOr use the wording of a level, then the code dictionary; an editor\'s own page text still wins', () => {
  assert.equal(translate('en', 'welcome.button'), 'Start');
  assert.equal(translate('en', 'welcome.button', undefined, { 'welcome.button': 'Kick off' }), 'Kick off');
  assert.equal(translate('hu', 'welcome.button', undefined, { 'welcome.title': 'x' }), 'Indítás', 'a key the level does not have comes from the dictionary');
  assert.equal(textOr('en', 'welcome.button', '', undefined, { 'welcome.button': 'Kick off' }), 'Kick off');
  assert.equal(textOr('en', 'welcome.button', 'My own', undefined, { 'welcome.button': 'Kick off' }), 'My own');
  assert.equal(textOr('hu', 'welcome.button', 'Start', undefined, { 'welcome.button': 'Indulás' }), 'Indulás', 'a stored English default counts as not set in Hungarian');
});

test('a stored value that no longer passes loses only the wordings that fail, not the rest', () => {
  assert.deepEqual(storedTexts({ en: { 'welcome.button': 'Kick off', 'old.removed.key': 'x', 'welcome.title': '<i>' }, hu: 'broken' }), { en: { 'welcome.button': 'Kick off' } });
  assert.deepEqual(storedTexts(undefined), {});
});

test('the stores: global in the settings, partner and event on their documents; the event\'s texts are the levels merged for its language', async () => {
  const { db, data } = fakeDb({ partners: [{ partnerId: 'P', name: 'Partner' }], events: [{ eventId: 'e1', partnerId: 'P', uiLanguage: 'hu', name: 'Event' }], admin_settings: [] });
  assert.deepEqual(await getGlobalTexts(db), {});
  await saveGlobalTexts(db, { hu: { 'welcome.button': 'Globális', 'welcome.title': 'Üdv' } }, 'admin@example.com', NOW);
  assert.equal(await savePartnerTexts(db, 'P', { hu: { 'welcome.button': 'Klub' } }, NOW), true);
  assert.equal(await savePartnerTexts(db, 'nobody', {}, NOW), false);
  assert.equal(await saveEventTexts(db, 'e1', { hu: { 'welcome.title': 'Meccsnap' }, en: { 'welcome.title': 'Match day' } }, NOW), true);

  const loaded = await loadEventTexts(db, data.events[0]);
  assert.equal(loaded.language, 'hu');
  assert.deepEqual(loaded.overrides, { 'welcome.button': 'Klub', 'welcome.title': 'Meccsnap' });
  assert.deepEqual(loaded.levels.global, { hu: { 'welcome.button': 'Globális', 'welcome.title': 'Üdv' } });
  assert.equal(data.admin_settings.length, 1, 'one global setting, updated in place');
  await saveGlobalTexts(db, {}, null, NOW);
  assert.equal(data.admin_settings.length, 1);
});

test('an event and a partner that wrote nothing have no wordings: nothing changes for them', async () => {
  const { db, data } = fakeDb({ partners: [{ partnerId: 'P', name: 'Partner' }], events: [{ eventId: 'e1', partnerId: 'P', name: 'Event' }], admin_settings: [] });
  const loaded = await loadEventTexts(db, data.events[0]);
  assert.equal(loaded.language, 'en');
  assert.deepEqual(loaded.overrides, {});
});
