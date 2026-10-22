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

test('only current rejection reasons are editable; retired person-annotation groups are absent', () => {
  const html = render('general');
  assert.ok(html.includes(GROUPS.reject_reason.label));
  for (const group of ['gender', 'age', 'emotion', 'merch'] as const) assert.ok(!html.includes(GROUPS[group].label), GROUPS[group].label);
  has(html, /Required: a photo cannot be rejected without it/);
  has(html, /Asked once for the photo/);
  assert.equal(count(html, /data-vocabulary-option=/g), 12, 'only standard rejection reasons are editable');
  lacks(html, /value="Female"/);
  lacks(html, /camera_gender_female/);
  has(html, /camera_rejected_nudity/);
  assert.equal(count(html, />Standard</g), 12);
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
  assert.equal(count(html, /data-offered="yes"/g), 12, 'all standard rejection reasons are offered');
  assert.equal(count(html, /data-offered="no"/g), 0, 'there are no hidden standard rejection reasons');
});

test('the options are plain words: no emoji anywhere in the editor', () => {
  lacks(render('event', [{ group: 'merch', key: 'vasas_scarf', label: 'Vasas scarf', custom: true }]), /\p{Extended_Pictographic}/u);
});

test('rejection reasons inherit, can be overridden, and custom reasons can be deleted and restored', () => {
  const general = { options: [{ group: 'reject_reason', key: 'nudity', label: 'Explicit content' }] };
  const partner = { options: [{ group: 'reject_reason', key: 'alcohol', hidden: true }, { group: 'reject_reason', key: 'club_policy', label: 'Club policy', custom: true }] };
  const stored: StoredOption[] = [
    { group: 'reject_reason', key: 'poor_quality', label: 'Unusable photo' },
    { group: 'reject_reason', key: 'club_specific', label: 'Club-specific issue', custom: true },
    { group: 'reject_reason', key: 'old_reason', label: 'Old reason', custom: true, hidden: true },
  ];
  const html = render('event', stored, { general, partner });
  has(html, /value="Explicit content"/);
  has(html, />General</);
  has(html, />Partner</);
  has(html, />Event</); // the relabelled rejection reason is set by the event
  has(html, />Added here</);
  assert.equal(count(html, /Follow the level above/g), 1, 'only the rejection reason differs from the level above');
  assert.equal(count(html, /aria-label="Unusable photo: follow the level above"/g), 1);
  assert.equal(count(html, /aria-label="Delete Club-specific issue"/g), 1);
  assert.equal(count(html, /aria-label="Delete (?:Club policy|Explicit content|Nudity or sexual content)"/g), 0, 'an option a level above added is hidden, never deleted');
  has(html, /1 deleted/);
  has(html, /Show deleted/);
  lacks(html, /Old reason/);
  has(html, /Everything is saved\./);
  // The hidden partner-level reason remains visible as hidden.
  has(html, /data-vocabulary-option="reject_reason:alcohol" data-offered="no"/);
});
