import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventShortUrlView, NO_COUNTS, toLinkView } from './view';

const link = { slug: 'k7f3q2', eventId: 'e1', placement: 'Giant screen', kind: 'qr' as const, active: true, createdAt: '2026-10-07T10:00:00.000Z' };

test('a link is shown with its full address and its counts, zero when nothing was counted', () => {
  assert.deepEqual(toLinkView('https://go.example.test', link, {}), { ...link, url: 'https://go.example.test/k7f3q2', counts: NO_COUNTS });
  const counts = { k7f3q2: { total: 9, android: 4, iphone: 3, other: 2, today: 7 } };
  assert.deepEqual(toLinkView('https://go.example.test', link, counts).counts, counts.k7f3q2);
});

test("the event's own short URL is shown like a link, or not at all when the event has none", () => {
  assert.equal(eventShortUrlView('https://go.example.test', null, {}), null);
  assert.equal(eventShortUrlView('https://go.example.test', '  ', {}), null);
  assert.deepEqual(eventShortUrlView('https://go.example.test', 'mtk', { mtk: { total: 1, android: 1, iphone: 0, other: 0, today: 1 } }), { slug: 'mtk', url: 'https://go.example.test/mtk', counts: { total: 1, android: 1, iphone: 0, other: 0, today: 1 } });
});
