import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGO_PLACE_SLOTS, isOnSlotModel, resolveEventLogos, resolveLogoPlace } from './logo';

const ids = (items: Array<{ id: string; level: string }>) => items.map((item) => `${item.level}:${item.id}`);

test('an event on the model that stored nothing uses the partner\'s logo in every place of use', () => {
  const partner = { slots: { logo: { items: ['messmass'] } } };
  const resolved = resolveEventLogos(partner, { slots: {} });
  for (const scenario of Object.keys(LOGO_PLACE_SLOTS)) assert.deepEqual(ids(resolved[scenario as keyof typeof resolved]), ['partner:messmass'], scenario);
});

test('before a partner is on the model its default rows of the scenario are its logo, so nothing it had is lost', () => {
  const partner = {
    defaultLogos: [
      { logoId: 'a', scenario: 'onboarding-thankyou', order: 1 },
      { logoId: 'b', scenario: 'onboarding-thankyou', order: 0 },
      { logoId: 'c', scenario: 'loading-capture', order: 0 },
    ],
  };
  assert.deepEqual(ids(resolveLogoPlace(partner, { slots: {} }, 'onboarding-thankyou')), ['partner:b', 'partner:a']);
  assert.deepEqual(ids(resolveLogoPlace(partner, { slots: {} }, 'loading-capture')), ['partner:c']);
  assert.deepEqual(resolveLogoPlace(partner, { slots: {} }, 'loading-slideshow'), []);
});

test('a partner that is on the model uses its slot and ignores its old default rows', () => {
  const partner = { slots: { logo: { items: ['new'] } }, defaultLogos: [{ logoId: 'old', scenario: 'onboarding-thankyou', order: 0 }] };
  assert.deepEqual(ids(resolveLogoPlace(partner, { slots: {} }, 'onboarding-thankyou')), ['partner:new']);
});

test('the event chooses: add more keeps the partner logo next to its own, replace leaves it out', () => {
  const partner = { slots: { logo: { items: ['messmass'] } } };
  assert.deepEqual(ids(resolveLogoPlace(partner, { slots: { logo: { items: ['own'] } } }, 'onboarding-thankyou')), ['event:own', 'partner:messmass']);
  assert.deepEqual(ids(resolveLogoPlace(partner, { slots: { logo: { items: ['own'], useDefault: false } } }, 'onboarding-thankyou')), ['event:own']);
  assert.deepEqual(resolveLogoPlace(partner, { slots: { logo: { useDefault: false } } }, 'onboarding-thankyou'), [], 'none');
});

test('a place of use takes the event\'s logo by default and can have its own, in that place only', () => {
  const partner = { slots: { logo: { items: ['messmass'] } } };
  const event = { slots: { logo: { items: ['own'] }, [LOGO_PLACE_SLOTS['loading-capture']]: { items: ['loading'], useDefault: false } } };
  assert.deepEqual(ids(resolveLogoPlace(partner, event, 'loading-capture')), ['place:loading']);
  assert.deepEqual(ids(resolveLogoPlace(partner, event, 'onboarding-thankyou')), ['event:own', 'partner:messmass']);
  const added = { slots: { [LOGO_PLACE_SLOTS['loading-slideshow']]: { items: ['extra'] } } };
  assert.deepEqual(ids(resolveLogoPlace(partner, added, 'loading-slideshow')), ['place:extra', 'partner:messmass']);
});

test('a change at the partner shows at once on an event that stored nothing: there is no copy', () => {
  const event = { slots: {} };
  assert.deepEqual(ids(resolveLogoPlace({ slots: { logo: { items: ['old'] } } }, event, 'loading-capture')), ['partner:old']);
  assert.deepEqual(ids(resolveLogoPlace({ slots: { logo: { items: ['new'] } } }, event, 'loading-capture')), ['partner:new']);
});

test('an event with no partner uses only what it chose itself', () => {
  assert.deepEqual(ids(resolveLogoPlace(null, { slots: { logo: { items: ['own'] } } }, 'onboarding-thankyou')), ['event:own']);
  assert.deepEqual(resolveLogoPlace(undefined, { slots: {} }, 'onboarding-thankyou'), []);
});

test('an event is on the model once its slots exist, even empty; before that it is read the old way by the caller', () => {
  assert.equal(isOnSlotModel({}), false);
  assert.equal(isOnSlotModel({ slots: undefined }), false);
  assert.equal(isOnSlotModel({ slots: {} }), true);
});

import { eventSlotsFromLegacy, partnerLogoValue } from './logo';

const legacyRow = (logoId: string, scenario: string, order = 0, isActive = true) => ({ logoId, scenario, order, isActive });
const SCENARIOS = ['slideshow-transition', 'onboarding-thankyou', 'loading-slideshow', 'loading-capture'];
const sameEverywhere = (logoId: string) => SCENARIOS.map((scenario) => legacyRow(logoId, scenario));

test('the partner\'s logos as the panel shows them: its slot, else the logos of its old default rows by order', () => {
  assert.deepEqual(partnerLogoValue({ slots: { logo: { items: ['x'] } }, defaultLogos: [{ logoId: 'old', scenario: 'loading-capture', order: 0 }] }), { items: ['x'] });
  assert.deepEqual(partnerLogoValue({ defaultLogos: [{ logoId: 'b', scenario: 'loading-capture', order: 1 }, { logoId: 'a', scenario: 'onboarding-thankyou', order: 0 }, { logoId: 'a', scenario: 'loading-capture', order: 0 }] }), { items: ['a', 'b'] });
  assert.deepEqual(partnerLogoValue(null), {});
});

test('migrating an event: one that follows its partner and shows what the partner gives stays following, nothing stored', () => {
  const partner = { defaultLogos: sameEverywhere('p1').map(({ logoId, scenario, order }) => ({ logoId, scenario, order })) };
  assert.deepEqual(eventSlotsFromLegacy({ logos: sameEverywhere('p1'), logosOverridden: false }, partner), {});
  assert.deepEqual(eventSlotsFromLegacy({ logos: [], logosOverridden: undefined }, { defaultLogos: [] }), {}, 'no list and a partner with none: following, still nothing');
});

test('migrating an event: its own list is kept as it showed, one logo slot when every scenario is the same, replace', () => {
  const partner = { defaultLogos: sameEverywhere('p1').map(({ logoId, scenario, order }) => ({ logoId, scenario, order })) };
  assert.deepEqual(eventSlotsFromLegacy({ logos: sameEverywhere('own'), logosOverridden: true }, partner), { logo: { items: ['own'], useDefault: false } });
  assert.deepEqual(eventSlotsFromLegacy({ logos: [], logosOverridden: true }, partner), { logo: { useDefault: false } }, 'it had switched everything off: none stays none');
  assert.deepEqual(eventSlotsFromLegacy({ logos: [legacyRow('a', 'onboarding-thankyou'), legacyRow('b', 'onboarding-thankyou', 1)], logosOverridden: true }, partner)['logo-pages'], { items: ['a', 'b'], useDefault: false });
});

test('migrating an event: a list that differs per scenario becomes one place of use per scenario, exactly what each showed', () => {
  const slots = eventSlotsFromLegacy({ logos: [legacyRow('a', 'onboarding-thankyou'), legacyRow('b', 'loading-capture'), legacyRow('c', 'loading-capture', 1, false)], logosOverridden: true }, null);
  assert.deepEqual(slots, {
    'logo-slideshow-transition': { useDefault: false },
    'logo-pages': { items: ['a'], useDefault: false },
    'logo-slideshow-loading': { useDefault: false },
    'logo-capture-loading': { items: ['b'], useDefault: false },
  });
});

test('migrating an event: a following event whose list is not what its partner gives any more keeps its list as its own', () => {
  const partner = { defaultLogos: sameEverywhere('new').map(({ logoId, scenario, order }) => ({ logoId, scenario, order })) };
  assert.deepEqual(eventSlotsFromLegacy({ logos: sameEverywhere('stale'), logosOverridden: false }, partner), { logo: { items: ['stale'], useDefault: false } });
});

test('migrating never changes what an event shows: the chain of the migrated event gives the old list in every scenario', () => {
  const cases = [
    { logos: sameEverywhere('own'), logosOverridden: true },
    { logos: [legacyRow('a', 'onboarding-thankyou'), legacyRow('b', 'loading-capture')], logosOverridden: true },
    { logos: [], logosOverridden: true },
    { logos: sameEverywhere('p1'), logosOverridden: false },
    { logos: sameEverywhere('stale'), logosOverridden: false },
  ];
  const partner = { defaultLogos: sameEverywhere('p1').map(({ logoId, scenario, order }) => ({ logoId, scenario, order })) };
  for (const legacy of cases) {
    const slots = eventSlotsFromLegacy(legacy, partner);
    for (const scenario of SCENARIOS as Array<'onboarding-thankyou' | 'loading-capture' | 'loading-slideshow' | 'slideshow-transition'>) {
      const before = [...new Set(legacy.logos.filter((row) => row.scenario === scenario && row.isActive).map((row) => row.logoId))];
      const expected = legacy.logosOverridden === false && before.join() === 'p1' ? ['p1'] : before;
      assert.deepEqual(resolveLogoPlace(partner, { slots }, scenario).map((item) => item.id), expected, `${JSON.stringify(legacy.logos.map((r) => r.logoId))} ${scenario}`);
    }
  }
});
