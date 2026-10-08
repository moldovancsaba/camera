import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chosenValue, libraryItemFor, pickableImages, pickerEndpoints, previewableUrl } from './picker';
import type { LibraryItemView } from './types';

const item = (id: string, extra: Partial<LibraryItemView> = {}): LibraryItemView => ({ id, kind: 'images', name: `Picture ${id}`, description: '', imageUrl: `https://store.example.test/${id}.png`, thumbnailUrl: null, scope: 'global', itemActive: true, createdAt: null, ...extra });

test('a picture field chooses from the library of the level of its page, and uploads to that level', () => {
  assert.deepEqual(pickerEndpoints({ scope: 'event', eventId: 'ev1' }), { list: '/api/events/ev1/library?kind=images', upload: '/api/events/ev1/library/upload', page: '/admin/events/ev1/images', words: 'the images of this event' });
  assert.deepEqual(pickerEndpoints({ scope: 'partner', partnerId: 'pa1' }), { list: '/api/partners/pa1/library?kind=images', upload: '/api/partners/pa1/library/upload', page: '/admin/partners/pa1/images', words: 'the images of this partner' });
  assert.deepEqual(pickerEndpoints({ scope: 'global' }), { list: '/api/images', upload: '/api/images', page: '/admin/images', words: 'the global images' });
});

test("what can be chosen: the event's whole library, the partner's library, the global list; never a switched-off picture or one without an address", () => {
  const event = { assigned: [], available: [item('a'), item('off', { itemActive: false }), item('none', { imageUrl: null })], missing: [] };
  assert.deepEqual(pickableImages('event', event).map((i) => i.id), ['a']);
  assert.deepEqual(pickableImages('partner', { items: [item('b'), item('c', { itemActive: false })], available: [item('not-yet')] }).map((i) => i.id), ['b'], 'a partner field chooses from its library, not from what it could still add');
  assert.deepEqual(pickableImages('global', { items: [item('g')] }).map((i) => i.id), ['g']);
  assert.deepEqual(pickableImages('global', null), []);
  assert.deepEqual(pickableImages('event', { available: 'nope' }), []);
});

test('the preview draws an http(s) address or a path of the site, and nothing while an address is still being typed', () => {
  const r2 = 'https://pub-b52ac4e9cc2b4199acd3a3b997ffdb0f.r2.dev/landing/mtk-vasas/background.jpg';
  assert.equal(previewableUrl(r2), r2, 'an address that is in no library still shows its preview');
  assert.equal(previewableUrl(`  ${r2} `), r2);
  assert.equal(previewableUrl('/fff/welcome.png'), '/fff/welcome.png');
  assert.equal(previewableUrl('http://example.test/a.png'), 'http://example.test/a.png');
  for (const typing of ['', '   ', 'h', 'https:', 'www.example.test/a.png', '//example.test/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA']) assert.equal(previewableUrl(typing), null, typing);
  assert.equal(previewableUrl(null), null);
});

test('a library picture is recognised by its address; choosing one stores its plain address, nothing else', () => {
  const items = [item('a'), item('b')];
  assert.equal(libraryItemFor('https://store.example.test/b.png', items)?.id, 'b');
  assert.equal(libraryItemFor(' https://store.example.test/b.png ', items)?.id, 'b');
  assert.equal(libraryItemFor('https://elsewhere.example.test/b.png', items), null);
  assert.equal(libraryItemFor('', items), null);
  assert.equal(chosenValue(items[0]), 'https://store.example.test/a.png');
  assert.equal(typeof chosenValue(items[0]), 'string');
});
