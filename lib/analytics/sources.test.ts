import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSourcesReport } from './sources';

const links = [
  { slug: 'scr123', placement: 'Giant screen', kind: 'qr' as const, active: true },
  { slug: 'pos456', placement: 'Poster', kind: 'qr' as const, active: true },
  { slug: 'mail78', placement: 'Newsletter', kind: 'link' as const, active: false },
];
const hit = (slug: string, day: string, device: 'android' | 'iphone' | 'other', count: number) => ({ slug, day, device, count });

test('visits by link, with the phone split, the last day, and a total for QR codes and for plain links', () => {
  const report = buildSourcesReport(links, [hit('scr123', '2026-10-16', 'android', 30), hit('scr123', '2026-10-16', 'iphone', 50), hit('scr123', '2026-10-17', 'iphone', 5), hit('pos456', '2026-10-16', 'other', 4), hit('mail78', '2026-10-17', 'other', 2)], null);
  assert.deepEqual(report.rows.map((r) => [r.placement, r.visits, r.android, r.iphone, r.other, r.lastDay]), [['Giant screen', 85, 30, 55, 0, '2026-10-17'], ['Poster', 4, 0, 0, 4, '2026-10-16'], ['Newsletter', 2, 0, 0, 2, '2026-10-17']]);
  assert.deepEqual(report.totals, { visits: 91, qr: 89, link: 2, android: 30, iphone: 55, other: 6 });
  assert.deepEqual(report.days, [{ day: '2026-10-16', visits: 84 }, { day: '2026-10-17', visits: 7 }]);
});

test('a link nobody visited is still listed with zero; an inactive link says so', () => {
  const report = buildSourcesReport(links, [], null);
  assert.equal(report.rows.length, 3);
  assert.ok(report.rows.every((r) => r.visits === 0));
  assert.equal(report.rows.find((r) => r.slug === 'mail78')?.active, false);
  assert.equal(report.totals.visits, 0);
});

test('visits through the event’s own short address have no link row and are still counted, under their own name; a deleted link is named as removed', () => {
  const report = buildSourcesReport([], [hit('vasas', '2026-10-16', 'iphone', 12), hit('gone99', '2026-10-16', 'other', 1)], 'vasas');
  assert.deepEqual(report.rows.map((r) => [r.placement, r.kind, r.visits]), [['Event short address (vasas)', 'own', 12], ['Removed link (gone99)', 'own', 1]]);
  assert.equal(report.totals.link, 13, 'a visit that is not through a QR link is counted as a link visit');
});

test('a range of days keeps the visits of those days, the end day included; bad counts are ignored', () => {
  const rows = [hit('scr123', '2026-10-15', 'other', 9), hit('scr123', '2026-10-16', 'other', 3), hit('scr123', '2026-10-17', 'other', 4), hit('scr123', '2026-10-18', 'other', 100), hit('scr123', '2026-10-16', 'iphone', -5), hit('scr123', '2026-10-16', 'iphone', Number.NaN)];
  const report = buildSourcesReport(links, rows, null, { from: '2026-10-16', to: '2026-10-17' });
  assert.equal(report.totals.visits, 7);
});
