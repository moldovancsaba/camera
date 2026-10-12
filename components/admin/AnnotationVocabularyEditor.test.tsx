import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { GROUPS, resolveOver, resolveVocabulary, type EditableLevel, type StoredOption } from '@/lib/photo-vetting/vocabulary';
import type { LevelView } from '@/lib/photo-vetting/vocabulary-level';
import AnnotationVocabularyEditor from './AnnotationVocabularyEditor';

/** What the server hands the editor: the level's own options, the list above it and the list as the level sees it. */
function viewOf(level: EditableLevel, stored: StoredOption[], upper: { general?: unknown; partner?: unknown } = {}): LevelView {
  const parent = level === 'general' ? resolveVocabulary() : level === 'partner' ? resolveVocabulary({ general: upper.general }) : resolveVocabulary({ general: upper.general, partner: upper.partner });
  return { level, id: level === 'general' ? null : 'abc', name: 'MTK', stored: { options: stored }, parent, resolved: resolveOver(parent, level, { options: stored }), groups: GROUPS };
}

const render = (level: EditableLevel, stored: StoredOption[] = [], upper: { general?: unknown; partner?: unknown } = {}) =>
  renderToStaticMarkup(
    <MantineProvider>
      <AnnotationVocabularyEditor level={level} id={level === 'general' ? null : 'abc'} initial={viewOf(level, stored, upper)} />
    </MantineProvider>
  );

const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;
// The page is long: a failed check names the pattern instead of printing the markup.
const has = (html: string, pattern: RegExp) => assert.ok(pattern.test(html), `expected the editor to show ${pattern}`);
const lacks = (html: string, pattern: RegExp) => assert.ok(!pattern.test(html), `expected the editor not to show ${pattern}`);

test('every group is listed with its question, whether it is required, one or several, and for whom; every standard option is a row with its words and its counter name', () => {
  const html = render('general');
  for (const info of Object.values(GROUPS)) assert.ok(html.includes(info.label), info.label);
  has(html, /Required: a person cannot be saved without it/);
  has(html, /Required: a photo cannot be rejected without it/);
  has(html, /Optional · One can be chosen · Asked for each person/);
  has(html, /Optional · Several can be chosen · Asked for each person/);
  has(html, /Asked once for the photo/);
  assert.equal(count(html, /data-vocabulary-option=/g), 32, 'the 32 standard options are rows (the ones that are off by default too)');
  has(html, /value="Female"/);
  has(html, /camera_gender_female/);
  has(html, /camera_rejected_nudity/);
  assert.equal(count(html, />Standard</g), 32);
});

test('nothing changed: everything is saved, Save and Discard are off, and no row offers to follow the level above, to delete, or to restore', () => {
  const html = render('general');
  has(html, /Everything is saved\./);
  has(html, /<button[^>]*disabled=""[^>]*><span[^>]*><span[^>]*>Save<\/span>/);
  has(html, /disabled=""[^>]*><span[^>]*><span[^>]*>Discard the changes<\/span>/);
  lacks(html, /Follow the level above/);
  lacks(html, /aria-label="Delete /);
  lacks(html, /aria-label="Restore /);
  lacks(html, /Show deleted/);
  assert.equal(count(html, /data-offered="yes"/g), 28, 'offered: the standard options that are on');
  assert.equal(count(html, /data-offered="no"/g), 4, 'the four recommended additions are hidden');
});

test('the options are plain words: no emoji anywhere in the editor', () => {
  lacks(render('event', [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true }]), /\p{Extended_Pictographic}/u);
});

test('at the event level: what a level above set shows where it comes from, what the event changed offers "Follow the level above", an option added here can be deleted and a deleted one is counted', () => {
  const general = { options: [{ group: 'merch', key: 'cap', label: 'Hat' }] };
  const partner = { options: [{ group: 'merch', key: 'scarf', hidden: true }, { group: 'merch', key: 'club_flag', label: 'Club flag', custom: true }] };
  const stored: StoredOption[] = [
    { group: 'merch', key: 'jersey', label: 'Club shirt' },
    { group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true },
    { group: 'merch', key: 'old_banner', label: 'Old banner', custom: true, hidden: true },
  ];
  const html = render('event', stored, { general, partner });
  has(html, /value="Hat"/);
  has(html, />General</);
  has(html, />Partner</);
  has(html, />Event</); // the relabelled jersey is set by the event
  has(html, />Added here</);
  assert.equal(count(html, /Follow the level above/g), 1, 'only the jersey differs from the level above');
  assert.equal(count(html, /aria-label="Club shirt: follow the level above"/g), 1);
  assert.equal(count(html, /aria-label="Delete Vasas scarf"/g), 1);
  assert.equal(count(html, /aria-label="Delete (?:Club flag|Hat|Scarf)"/g), 0, 'an option a level above added is hidden, never deleted');
  has(html, /1 deleted/);
  has(html, /Show deleted/);
  lacks(html, /Old banner/);
  has(html, /Everything is saved\./);
  // The hidden scarf of the partner is in the list as Hidden, from the partner.
  has(html, /data-vocabulary-option="merch:scarf" data-offered="no"/);
});
