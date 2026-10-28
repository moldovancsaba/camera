import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en } from './messages.en';
import { translate, UI_LANGUAGES } from './index';
import { TEXT_GROUPS, groupedCatalog, textCatalog } from './catalog';

test('every dictionary key is available in every locale and every group has a name an editor can read', () => {
  const catalog = textCatalog();
  assert.equal(catalog.length, Object.keys(en).length);
  for (const entry of catalog) {
    assert.ok(entry.en && UI_LANGUAGES.every((language) => entry.messages[language]), `${entry.key} has all locale wordings`);
    assert.ok(TEXT_GROUPS[entry.group], `the group "${entry.group}" of ${entry.key} needs a name in TEXT_GROUPS (lib/i18n/catalog.ts)`);
  }
});

test('the groups come in the order of the editor and hold all the keys once', () => {
  const groups = groupedCatalog();
  assert.equal(groups[0].group, 'welcome');
  assert.equal(groups.flatMap((g) => g.entries).length, Object.keys(en).length);
  assert.equal(new Set(groups.map((g) => g.group)).size, groups.length);
});

test('the profile wordings (issue 521, owner answers 248 to 251) are Dictionary texts with preserved placeholders, so an editor can change them at every level', () => {
  const keys = (['profile.consent', 'profile.consent.purpose', 'profile.consent.link', 'profile.notice'] as const);
  const markers = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of keys) {
    const entry = textCatalog().find((e) => e.key === key);
    assert.ok(entry, `${key} is in the catalog`);
    assert.equal(entry!.group, 'profile');
    assert.deepEqual(markers(entry!.messages.hu), markers(entry!.en), `${key}: the same placeholders in Hungarian`);
  }
  for (const language of ['en', 'hu'] as const) {
    const text = translate(language, 'profile.consent', { organiser: 'MTK', purpose: translate(language, 'profile.consent.purpose'), link: translate(language, 'profile.consent.link') });
    assert.doesNotMatch(text, /\{\w+\}/, `${language}: every placeholder is filled`);
    assert.match(text, /MTK/);
  }
  assert.equal(translate('en', 'profile.notice', undefined, { 'profile.notice': 'Own words.' }), 'Own words.', 'a partner or event text wins over the dictionary');
});

test('the AI training wordings (issue 628, owner answer 457) are Dictionary drafts with preserved placeholders, editable at every level', () => {
  const keys = (['training.consent', 'training.consent.link', 'training.notice'] as const);
  const markers = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of keys) {
    const entry = textCatalog().find((e) => e.key === key);
    assert.ok(entry, `${key} is in the catalog`);
    assert.equal(entry!.group, 'training');
    assert.deepEqual(markers(entry!.messages.hu), markers(entry!.en), `${key}: the same placeholders in Hungarian`);
  }
  for (const language of ['en', 'hu'] as const) {
    const text = translate(language, 'training.consent', { organiser: 'MTK', link: translate(language, 'training.consent.link') });
    assert.doesNotMatch(text, /\{\w+\}/, `${language}: every placeholder is filled`);
    assert.match(text, /MTK/);
  }
});
