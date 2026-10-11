import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { effectiveCheckboxes } from '@/lib/events/checkbox-settings';
import CheckboxSettingsFields, { describeEffective, type CheckboxModes } from './CheckboxSettingsFields';

const noop = () => undefined;
const NONE: CheckboxModes = { terms: '', cookies: '', privacy: '', acceptance: '', gallery: '' };
const render = (props: Partial<Parameters<typeof CheckboxSettingsFields>[0]> = {}) => renderToStaticMarkup(<CheckboxSettingsFields modes={NONE} onChange={noop} level="event" {...props} />);
const rows = (html: string) => [...html.matchAll(/data-checkbox-setting="(\w+)"/g)].map((m) => m[1]);
const options = (html: string, kind: string) => {
  const row = html.split('<label').find((part) => part.includes(`data-checkbox-setting="${kind}"`)) ?? '';
  return [...row.matchAll(/<option value="(\w*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
};

test('every kind of checkbox has a row with the choices shown and required, shown and optional, not shown, and the first choice that follows the partner', () => {
  const html = render();
  assert.deepEqual(rows(html), ['terms', 'cookies', 'privacy', 'acceptance', 'gallery']);
  for (const kind of ['terms', 'cookies', 'privacy', 'acceptance', 'gallery']) assert.deepEqual(options(html, kind).map(([value]) => value), ['', 'required', 'optional', 'off'], kind);
  assert.deepEqual(options(html, 'terms'), [['', 'Same as the partner (shown, required)'], ['required', 'Shown, required'], ['optional', 'Shown, optional'], ['off', 'Not shown']]);
  assert.match(html, /data-gallery-consent-setting/, 'the gallery permission keeps its marker');
  assert.match(html, /checked by the server too/, 'it says that required is checked by the server');
  assert.equal((html.match(/checked by the server too/g) ?? []).length, 1, 'once, not on every row');
});

test('a row can be limited to the kinds a page editor shows (the Who-are-you page shows the acceptance only, the consent page the acceptance and the gallery permission)', () => {
  assert.deepEqual(rows(render({ kinds: ['acceptance'] })), ['acceptance']);
  assert.deepEqual(rows(render({ kinds: ['gallery', 'acceptance'] })), ['acceptance', 'gallery']);
});

test('"Same as the partner" says what the partner gives, so an editor knows what following means', () => {
  const partner = effectiveCheckboxes(null, { consentSettings: { cookies: { shown: false }, privacy: { shown: true, required: false }, gallery: { required: true } }, galleryConsent: true, acceptanceOnWhoAreYou: true });
  const html = render({ followed: partner });
  assert.equal(options(html, 'terms')[0][1], 'Same as the partner (required)');
  assert.equal(options(html, 'cookies')[0][1], 'Same as the partner (not shown)');
  assert.equal(options(html, 'privacy')[0][1], 'Same as the partner (optional)');
  assert.equal(options(html, 'acceptance')[0][1], 'Same as the partner (required)');
  assert.equal(options(html, 'gallery')[0][1], 'Same as the partner (required)');
  assert.equal(describeEffective('gallery', effectiveCheckboxes(null, null).gallery), 'not asked');
  assert.equal(describeEffective('acceptance', effectiveCheckboxes(null, null).acceptance), 'own page');
});

test('the partner’s rows start from the standard, and the gallery permission has no “no choice” state: not asking is its standard', () => {
  const html = render({ level: 'partner' });
  assert.deepEqual(options(html, 'terms')[0], ['', 'Standard (shown, required, as before)']);
  assert.deepEqual(options(html, 'gallery'), [['required', 'Asked, required: the photo cannot be saved without it'], ['optional', 'Asked, optional: a box not ticked'], ['off', 'Not asked: the terms the user accepts cover it (standard)']]);
  const chosen = render({ level: 'partner', modes: { ...NONE, gallery: 'optional', cookies: 'off' } });
  assert.match(chosen.split('data-checkbox-setting="gallery"')[1], /<option value="optional" selected/);
  assert.match(chosen.split('data-checkbox-setting="cookies"')[1], /<option value="off" selected/);
});
