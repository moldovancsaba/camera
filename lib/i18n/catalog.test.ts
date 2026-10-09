import assert from 'node:assert/strict';
import { test } from 'node:test';
import { en } from './messages.en';
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
