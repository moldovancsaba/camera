import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventEmoji, firstEmoji, isEmojiGrapheme, withoutEmoji } from './emoji';

test('the emoji of the real event names is found, whole', () => {
  assert.equal(firstEmoji('⚽ DVTK x Kazincbarcika'), '⚽');
  assert.equal(firstEmoji('🏍️ MotoGP - Balatonpark Circuit - Saturday'), '🏍️', 'a symbol with its emoji selector stays whole');
  assert.equal(firstEmoji('[🏀] FIBA U20 - Day I'), '🏀', 'inside brackets');
  assert.equal(firstEmoji('🏀 FIBA U20 – Day VII'), '🏀');
  assert.equal(firstEmoji('🎸 Plázs Siófok x Halott Pénz'), '🎸');
  assert.equal(firstEmoji('🏐 Hungary x Turkey'), '🏐');
});

test('sequences stay in one piece: a flag, a joined family, a keycap, a skin tone', () => {
  assert.equal(firstEmoji('🇭🇺 Hungary'), '🇭🇺');
  assert.equal(firstEmoji('Final 👨‍👩‍👧 day'), '👨‍👩‍👧');
  assert.equal(firstEmoji('Top 3️⃣'), '3️⃣');
  assert.equal(firstEmoji('👍🏽 thanks'), '👍🏽');
});

test('the first emoji wins, wherever it is in the text', () => {
  assert.equal(firstEmoji('Roma ⚽ x Lazio 🏀'), '⚽');
  assert.equal(firstEmoji('Final 🏆'), '🏆');
});

test('text that only looks like an emoji is not one: ©, ™, digits, #, *, plain letters', () => {
  for (const text of ['Copyright © 2026', 'Brand™ Night', 'Day 3', '#1 Fan', '5* hotel', 'Casademont Zaragoza - Basket Landes', '', null, undefined]) {
    assert.equal(firstEmoji(text), null, String(text));
  }
  assert.equal(isEmojiGrapheme('©'), false);
  assert.equal(isEmojiGrapheme('©️'), true, 'with the emoji selector it is a picture');
});

test('an event takes the emoji of its name, else of a team, else of the partner', () => {
  assert.equal(eventEmoji({ name: '⚽ A x B' }, '🏀 Club'), '⚽');
  assert.equal(eventEmoji({ name: 'A x B', homeTeam: { name: '🦊 Roma' } }, '🏀 Club'), '🦊');
  assert.equal(eventEmoji({ name: 'A x B', visitorTeam: { name: 'Udine 🦓' } }), '🦓');
  assert.equal(eventEmoji({ name: 'A x B' }, 'Club 🏀'), '🏀');
  assert.equal(eventEmoji({ name: 'A x B' }, 'Club'), null);
  assert.equal(eventEmoji({}), null);
});

test('the emoji used as the logo is taken out of the name, with its brackets, so it is not shown twice', () => {
  assert.equal(withoutEmoji('⚽ DVTK x Kazincbarcika', '⚽'), 'DVTK x Kazincbarcika');
  assert.equal(withoutEmoji('[🏀] FIBA U20 - Day I', '🏀'), 'FIBA U20 - Day I');
  assert.equal(withoutEmoji('🏀 FIBA U20 – Day VII', '🏀'), 'FIBA U20 – Day VII');
  assert.equal(withoutEmoji('🏍️ MotoGP - Balatonpark Circuit - Saturday', '🏍️'), 'MotoGP - Balatonpark Circuit - Saturday');
  assert.equal(withoutEmoji('Final 🏆 night', '🏆'), 'Final night');
  assert.equal(withoutEmoji('(⚽) Derby', '⚽'), 'Derby');
});

test('nothing changes without an emoji, when the name has none, or when nothing would be left', () => {
  assert.equal(withoutEmoji('Fan Day', null), 'Fan Day');
  assert.equal(withoutEmoji('Fan Day', '⚽'), 'Fan Day');
  assert.equal(withoutEmoji('⚽', '⚽'), '⚽');
  assert.equal(withoutEmoji('[⚽]', '⚽'), '[⚽]');
});
