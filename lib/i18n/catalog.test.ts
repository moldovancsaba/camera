import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en } from './messages.en';
import { translate } from './index';
import { TEXT_GROUPS, groupedCatalog, textCatalog } from './catalog';

test('every key of the dictionary is in the catalog with both languages, and every group has a name an editor can read', () => {
  const catalog = textCatalog();
  assert.equal(catalog.length, Object.keys(en).length);
  for (const entry of catalog) {
    assert.ok(entry.en && entry.hu, `${entry.key} has both wordings`);
    assert.ok(TEXT_GROUPS[entry.group], `the group "${entry.group}" of ${entry.key} needs a name in TEXT_GROUPS (lib/i18n/catalog.ts)`);
  }
});

test('the groups come in the order of the editor and hold all the keys once', () => {
  const groups = groupedCatalog();
  assert.equal(groups[0].group, 'welcome');
  assert.equal(groups.flatMap((g) => g.entries).length, Object.keys(en).length);
  assert.equal(new Set(groups.map((g) => g.group)).size, groups.length);
});

test('the profile wordings (issue 521, owner answers 248 to 251) are Dictionary texts in both languages with the same placeholders, so an editor can change them at every level', () => {
  const keys = (['profile.consent', 'profile.consent.purpose', 'profile.consent.link', 'profile.notice'] as const);
  const markers = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of keys) {
    const entry = textCatalog().find((e) => e.key === key);
    assert.ok(entry, `${key} is in the catalog`);
    assert.equal(entry!.group, 'profile');
    assert.deepEqual(markers(entry!.hu), markers(entry!.en), `${key}: the same placeholders in English and Hungarian`);
  }
  for (const language of ['en', 'hu'] as const) {
    const text = translate(language, 'profile.consent', { organiser: 'MTK', purpose: translate(language, 'profile.consent.purpose'), link: translate(language, 'profile.consent.link') });
    assert.doesNotMatch(text, /\{\w+\}/, `${language}: every placeholder is filled`);
    assert.match(text, /MTK/);
  }
  assert.equal(translate('en', 'profile.notice', undefined, { 'profile.notice': 'Own words.' }), 'Own words.', 'a partner or event text wins over the dictionary');
});
