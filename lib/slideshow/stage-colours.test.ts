import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { stageColours } from './stage-colours';

const hex = (digits: string) => `#${digits}`;
const THEME = { background: hex('189CD8') };

test('colours an editor set on the slideshow win', () => {
  assert.deepEqual(stageColours({ primary: hex('112233'), accent: hex('445566') }, THEME), { primary: hex('112233'), accent: hex('445566'), source: 'own' });
});

test('with none set the screen is in the colours of the event\'s theme: its page colour, fading to a deeper one', () => {
  const out = stageColours({}, THEME);
  assert.equal(out.source, 'theme');
  assert.equal(out.primary, THEME.background);
  assert.notEqual(out.accent, THEME.background);
  assert.match(out.accent, /^#[0-9a-f]{6}$/i);
  // a blank string is no choice
  assert.equal(stageColours({ primary: '  ', accent: '' }, THEME).primary, THEME.background);
});

test('one colour set: it is kept and the other comes from the theme', () => {
  const out = stageColours({ primary: hex('112233') }, THEME);
  assert.equal(out.primary, hex('112233'));
  assert.notEqual(out.accent, SLIDESHOW_DEFAULT_BACKGROUND_ACCENT);
  assert.equal(out.source, 'theme');
});

test('only an event with no theme at all falls back to the built-in indigo', () => {
  assert.deepEqual(stageColours({}, null), { primary: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, accent: SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, source: 'default' });
  assert.equal(stageColours({ accent: hex('445566') }, undefined).accent, hex('445566'));
});
