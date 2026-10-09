import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeDb } from '@/lib/library/fake-db';
import { emailDefaults } from './submission-template-defaults';
import { getGlobalLegal, loadEventLegal, parseLegal, resolveLegal, saveEventLegal, saveGlobalLegal, savePartnerLegal, storedLegal, withoutStandardLegalTail, LEGAL_MAX } from './legal';

const GLOBAL = { en: 'General terms: {terms}', hu: 'Általános feltételek: {terms}' };

test('the legal part is checked: the languages we have, text, at most the limit; an empty text takes a language away', () => {
  assert.deepEqual(parseLegal(undefined), { ok: true, value: {} });
  assert.deepEqual(parseLegal(null), { ok: true, value: {} });
  assert.deepEqual(parseLegal({ en: '  Terms\r\n\r\n{terms} ', hu: '   ' }), { ok: true, value: { en: 'Terms\n\n{terms}' } });
  for (const bad of ['x', ['x'], { de: 'x' }, { en: 7 }, { en: 'x'.repeat(LEGAL_MAX + 1) }]) assert.equal(parseLegal(bad).ok, false, JSON.stringify(bad));
  assert.equal(parseLegal({ en: 'x'.repeat(LEGAL_MAX) }).ok, true);
});

test('what is stored is read tolerantly: only our languages, only text', () => {
  assert.deepEqual(storedLegal({ en: ' Terms ', hu: 5, de: 'x' }), { en: 'Terms' });
  for (const bad of [undefined, null, 'x', 7, []]) assert.deepEqual(storedLegal(bad), {});
});

test('the event follows its partner and the partner follows the general one, per language; what a level sets is its own', () => {
  const none = { global: {}, partner: {}, event: {} };
  assert.equal(resolveLegal('hu', none), null, 'no level has one: nothing is added');
  assert.deepEqual(resolveLegal('hu', { ...none, global: GLOBAL }), { text: GLOBAL.hu, source: 'global' });
  assert.deepEqual(resolveLegal('hu', { global: GLOBAL, partner: { hu: 'MTK feltételek' }, event: {} }), { text: 'MTK feltételek', source: 'partner' }, 'the partner’s becomes the default of its events');
  assert.deepEqual(resolveLegal('hu', { global: GLOBAL, partner: { hu: 'MTK feltételek' }, event: { hu: 'Meccs feltételek' } }), { text: 'Meccs feltételek', source: 'event' });
  assert.deepEqual(resolveLegal('en', { global: GLOBAL, partner: { hu: 'MTK feltételek' }, event: { hu: 'Meccs feltételek' } }), { text: GLOBAL.en, source: 'global' }, 'a level that wrote only Hungarian does not speak for English');
});

test('the standard terms paragraph goes from the end of a template when there is a legal part, in every language; an editor’s own paragraph stays', () => {
  for (const language of ['en', 'hu'] as const) {
    const defaults = emailDefaults(language);
    for (const body of [defaults.body, defaults.resubmissionBody, defaults.notApprovedBody]) {
      const stripped = withoutStandardLegalTail(body);
      assert.equal(stripped.includes('{terms}'), false, `${language}: ${body.slice(0, 20)}`);
      assert.ok(stripped.length > 10 && body.startsWith(stripped));
    }
  }
  assert.equal(withoutStandardLegalTail(emailDefaults('en').body.replace('Policies and General Terms and Conditions:', 'Our own policy page:')), emailDefaults('en').body.replace('Policies and General Terms and Conditions:', 'Our own policy page:'), 'an own paragraph is not touched');
  assert.equal(withoutStandardLegalTail('Only one paragraph'), 'Only one paragraph');
  const mtk = 'Szia {name}!\n\nAz Általános Szerződési Feltételeket ezeken a linkeken találod meg: {terms} ...';
  assert.equal(withoutStandardLegalTail(mtk), mtk, 'the long paragraph MTK wrote itself stays until it is moved into the legal part');
});

test('the stores: the general part, the partner’s and the event’s are written and read back, and the event resolves in its language', async () => {
  const { db, data } = fakeDb({ admin_settings: [], partners: [{ partnerId: 'P', name: 'MTK', uiLanguage: 'hu' }], events: [{ eventId: 'E', partnerId: 'P', name: 'Derby' }] });
  assert.deepEqual(await getGlobalLegal(db), {});
  await saveGlobalLegal(db, GLOBAL, 'admin@example.com', 'now');
  assert.deepEqual(await getGlobalLegal(db), GLOBAL);

  const event = data.events[0];
  let loaded = await loadEventLegal(db, event);
  assert.equal(loaded.language, 'hu', 'the event follows its partner’s language');
  assert.deepEqual(loaded.effective, { text: GLOBAL.hu, source: 'global' });

  assert.equal(await savePartnerLegal(db, 'P', { hu: 'MTK feltételek' }, 'now'), true);
  loaded = await loadEventLegal(db, data.events[0]);
  assert.deepEqual(loaded.effective, { text: 'MTK feltételek', source: 'partner' });

  assert.equal(await saveEventLegal(db, 'E', { hu: 'Meccs feltételek' }, 'now'), true);
  loaded = await loadEventLegal(db, data.events[0]);
  assert.deepEqual(loaded.effective, { text: 'Meccs feltételek', source: 'event' });
  assert.deepEqual(loaded.levels.partner, { hu: 'MTK feltételek' }, 'the partner’s own is untouched by the event’s');

  assert.equal(await saveEventLegal(db, 'nope', {}, 'now'), false);
});
