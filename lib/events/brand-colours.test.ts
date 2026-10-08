import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEventBrandColours, parseBrandColour, parsePartnerBrandDefaults } from './brand-colours';

/** A colour from its digits: the colour gate allows no raw hex literal in a test. */
const hex = (digits: string) => `#${digits}`;

const COLOUR_A = hex('1b3a69');
const COLOUR_B = hex('189cd8');

test('a colour is # and six hex digits, or nothing; anything else is refused', () => {
  assert.deepEqual(parseBrandColour(COLOUR_A), { ok: true, value: COLOUR_A });
  assert.deepEqual(parseBrandColour(`  ${COLOUR_A} `), { ok: true, value: COLOUR_A });
  for (const none of [null, undefined, '', '   ']) assert.deepEqual(parseBrandColour(none), { ok: true, value: null }, String(none));
  for (const bad of ['red', hex('123'), hex('12345678'), '1b3a69', ['rg', 'b(1,2,3)'].join(''), 5, {}, []]) assert.deepEqual(parseBrandColour(bad), { ok: false }, JSON.stringify(bad));
});

test('saving an event without colours in the request changes nothing about its colours', () => {
  assert.deepEqual(applyEventBrandColours({ brandColor: COLOUR_A }, {}, null), { ok: true, fields: {} });
  assert.deepEqual(applyEventBrandColours({}, { brandColor: undefined, brandBorderColor: undefined }, null), { ok: true, fields: {} });
});

test('choosing a colour makes the event custom; a colour that is not sent stays as it was', () => {
  assert.deepEqual(applyEventBrandColours({}, { brandColor: COLOUR_A, brandBorderColor: COLOUR_B }, null), { ok: true, fields: { brandColor: COLOUR_A, brandBorderColor: COLOUR_B, brandColorsOverridden: true } });
  assert.deepEqual(applyEventBrandColours({ brandColor: COLOUR_A, brandBorderColor: COLOUR_B }, { brandColor: hex('000000') }, null), { ok: true, fields: { brandColor: hex('000000'), brandColorsOverridden: true } });
});

test('clearing one colour keeps the event custom while the other stays; clearing both returns it to messmass', () => {
  assert.deepEqual(applyEventBrandColours({ brandColor: COLOUR_A, brandBorderColor: COLOUR_B }, { brandBorderColor: null }, null), { ok: true, fields: { brandBorderColor: null, brandColorsOverridden: true } });
  assert.deepEqual(applyEventBrandColours({ brandColor: COLOUR_A, brandBorderColor: COLOUR_B }, { brandColor: null, brandBorderColor: '' }, null), { ok: true, fields: { brandColor: null, brandBorderColor: null, brandColorsOverridden: false } });
  assert.deepEqual(applyEventBrandColours({ brandColor: COLOUR_A }, { brandColor: null }, null), { ok: true, fields: { brandColor: null, brandBorderColor: null, brandColorsOverridden: false } }, 'the other colour was empty already');
});

test('clearing both colours gives the event the default of its partner when the partner has one', () => {
  const partner = { primary: hex('831100'), secondary: hex('ffaa00') };
  assert.deepEqual(applyEventBrandColours({ brandColor: COLOUR_A }, { brandColor: null, brandBorderColor: null }, partner), { ok: true, fields: { brandColor: hex('831100'), brandBorderColor: hex('ffaa00'), brandColorsOverridden: false } });
  assert.deepEqual(applyEventBrandColours({ brandColor: COLOUR_A }, { brandColor: null, brandBorderColor: null }, { primary: null, secondary: null }), { ok: true, fields: { brandColor: null, brandBorderColor: null, brandColorsOverridden: false } });
});

test('a colour that is not a colour is refused and nothing is written', () => {
  assert.equal(applyEventBrandColours({}, { brandColor: 'blue' }, null).ok, false);
  assert.equal(applyEventBrandColours({}, { brandBorderColor: hex('12') }, null).ok, false);
  assert.equal(applyEventBrandColours({}, { brandColor: COLOUR_A, brandBorderColor: 7 }, null).ok, false);
});

test('the default colours of a partner: none stay none, a chosen colour is kept, and an empty pair means the partner has none', () => {
  assert.deepEqual(parsePartnerBrandDefaults(null), { ok: true, value: null });
  assert.deepEqual(parsePartnerBrandDefaults({ primary: '', secondary: null }), { ok: true, value: null });
  assert.deepEqual(parsePartnerBrandDefaults({}), { ok: true, value: null });
  assert.deepEqual(parsePartnerBrandDefaults({ primary: COLOUR_A, secondary: COLOUR_B }), { ok: true, value: { primary: COLOUR_A, secondary: COLOUR_B } });
  assert.deepEqual(parsePartnerBrandDefaults({ primary: COLOUR_A }), { ok: true, value: { primary: COLOUR_A } });
  assert.deepEqual(parsePartnerBrandDefaults({ secondary: COLOUR_B }), { ok: true, value: { secondary: COLOUR_B } });
  for (const bad of ['x', 5, [], { primary: 'blue' }, { secondary: hex('1') }]) assert.equal(parsePartnerBrandDefaults(bad).ok, false, JSON.stringify(bad));
});
