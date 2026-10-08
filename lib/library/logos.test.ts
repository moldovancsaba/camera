import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LogoScenario } from '@/lib/db/schemas';
import { DEFAULT_UPLOAD_SCENARIO, LOGO_SCENARIOS, inGuestOrder, isLogoScenario, logoDefaultsOf, parseLogoDefaults, sameLogoDefaults, shownLogo } from './logos';

test('the scenarios of the pages are exactly the scenarios of the data', () => {
  assert.deepEqual(LOGO_SCENARIOS.map((s) => s.id).sort(), Object.values(LogoScenario).sort());
  assert.equal(isLogoScenario('onboarding-thankyou'), true);
  assert.equal(isLogoScenario('everywhere'), false);
  assert.equal(isLogoScenario(undefined), false);
  assert.equal(DEFAULT_UPLOAD_SCENARIO, 'onboarding-thankyou', 'an upload goes on top of the guest pages unless the editor chooses');
  assert.equal(LOGO_SCENARIOS.find((s) => s.id === 'slideshow-transition')?.shownToGuests, false, 'no screen reads this scenario');
});

test('the defaults of a partner are read as stored, without the rows that are not well-formed', () => {
  const partner = {
    defaultLogos: [
      { logoId: 'l1', scenario: 'slideshow-transition', order: 0 },
      { logoId: 'l1', scenario: 'onboarding-thankyou', order: 1 },
      { logoId: '', scenario: 'loading-capture', order: 2 },
      { logoId: 'l2', scenario: 'nowhere', order: 3 },
      { logoId: 'l3', scenario: 'loading-capture' },
    ],
  };
  assert.deepEqual(logoDefaultsOf(partner), [
    { logoId: 'l1', scenario: 'slideshow-transition', order: 0 },
    { logoId: 'l1', scenario: 'onboarding-thankyou', order: 1 },
    { logoId: 'l3', scenario: 'loading-capture', order: 4 },
  ]);
  assert.deepEqual(logoDefaultsOf({}), []);
  assert.deepEqual(logoDefaultsOf(null), []);
});

test('defaults sent by a page: a scenario and an order per logo; the same logo twice in a scenario counts once', () => {
  const parsed = parseLogoDefaults([
    { logoId: 'l1', scenario: 'onboarding-thankyou', order: 2 },
    { logoId: 'l1', scenario: 'loading-capture' },
    { logoId: 'l1', scenario: 'onboarding-thankyou', order: 5 },
  ]);
  assert.deepEqual(parsed, { ok: true, rows: [{ logoId: 'l1', scenario: 'onboarding-thankyou', order: 2 }, { logoId: 'l1', scenario: 'loading-capture', order: 1 }] });
  assert.deepEqual(parseLogoDefaults([]), { ok: true, rows: [] });
});

test('defaults that are not well-formed are refused with a plain reason', () => {
  for (const bad of ['l1', [{ scenario: 'onboarding-thankyou' }], [{ logoId: 'l1', scenario: 'nowhere' }], [{ logoId: 'l1', scenario: 'loading-capture', order: -1 }], [{ logoId: 'l1', scenario: 'loading-capture', order: 1.5 }], [null]]) {
    const parsed = parseLogoDefaults(bad);
    assert.equal(parsed.ok, false, JSON.stringify(bad));
    assert.ok(!parsed.ok && parsed.reason.length > 0);
  }
});

test('two lists of defaults are the same only with the same logos, scenarios and orders in the same order', () => {
  const a = [{ logoId: 'l1', scenario: 'onboarding-thankyou' as const, order: 0 }];
  assert.equal(sameLogoDefaults(a, [{ ...a[0] }]), true);
  assert.equal(sameLogoDefaults(a, [{ ...a[0], order: 1 }]), false);
  assert.equal(sameLogoDefaults(a, [{ ...a[0], scenario: 'loading-capture' }]), false);
  assert.equal(sameLogoDefaults(a, []), false);
});

test('a guest sees the first active logo of a scenario by order, the event order for equal ones: never a random one', () => {
  const rows = [
    { logoId: 'late', order: 3, isActive: true },
    { logoId: 'off', order: 0, isActive: false },
    { logoId: 'first', order: 1, isActive: true },
    { logoId: 'tie', order: 1, isActive: true },
  ];
  assert.deepEqual(inGuestOrder(rows).map((r) => r.logoId), ['off', 'first', 'tie', 'late']);
  assert.equal(shownLogo(rows)?.logoId, 'first');
  assert.equal(shownLogo([{ order: 0, isActive: false }]), null);
  assert.equal(shownLogo([]), null);
  // The same comparison as the event logos API (`a.order - b.order`): a row without an order keeps its place.
  const unordered = [{ logoId: 'a', isActive: true }, { logoId: 'b', order: 0, isActive: true }];
  assert.deepEqual(inGuestOrder(unordered).map((r) => r.logoId), [...unordered].sort((x, y) => (x as { order?: number }).order! - (y as { order?: number }).order!).map((r) => r.logoId));
});
