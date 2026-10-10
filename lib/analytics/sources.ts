/**
 * Where the users came from, as far as it is recorded (issue 521, phase 1): the counted visits of the tracked short links of an event (the giant screen QR, a poster, an e-mail) and of its own
 * short address, by link, day and kind of phone (`short_link_hits`, camera#320). A visit is a person's browser being sent on, not a different person, and the redirect does not pass the link on,
 * so a photo cannot be tied to the link that brought the user (listed in `NOT_MEASURED`). Pure; unit-tested in sources.test.ts.
 */

import { dayInRange } from './time';

export interface SourceLink {
  slug: string;
  placement: string;
  kind: 'qr' | 'link';
  active: boolean;
}

export interface SourceHit {
  slug: string;
  /** UTC day of the visit, as the hit rows are kept. */
  day: string;
  device: 'android' | 'iphone' | 'other';
  count: number;
}

export interface SourceRow {
  slug: string;
  placement: string;
  kind: 'qr' | 'link' | 'own';
  active: boolean;
  visits: number;
  android: number;
  iphone: number;
  other: number;
  lastDay: string | null;
}

export interface SourcesReport {
  rows: SourceRow[];
  totals: { visits: number; qr: number; link: number; android: number; iphone: number; other: number };
  days: Array<{ day: string; visits: number }>;
}

const whole = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export function buildSourcesReport(links: readonly SourceLink[], hits: readonly SourceHit[], ownSlug: string | null, range: { from?: string | null; to?: string | null } = {}): SourcesReport {
  const rows = new Map<string, SourceRow>();
  for (const link of links) {
    rows.set(link.slug, { slug: link.slug, placement: link.placement, kind: link.kind, active: link.active, visits: 0, android: 0, iphone: 0, other: 0, lastDay: null });
  }
  const dayTotals = new Map<string, number>();
  const totals = { visits: 0, qr: 0, link: 0, android: 0, iphone: 0, other: 0 };
  for (const hit of hits) {
    if (!dayInRange(hit.day, range.from, range.to)) continue;
    const count = whole(hit.count);
    if (count === 0) continue;
    // A slug with no link row is the event's own short address (or a link that was deleted): its visits are still visits.
    const row = rows.get(hit.slug) ?? { slug: hit.slug, placement: hit.slug === ownSlug ? `Event short address (${hit.slug})` : `Removed link (${hit.slug})`, kind: 'own' as const, active: hit.slug === ownSlug, visits: 0, android: 0, iphone: 0, other: 0, lastDay: null };
    row.visits += count;
    row[hit.device] += count;
    if (!row.lastDay || hit.day > row.lastDay) row.lastDay = hit.day;
    rows.set(hit.slug, row);
    dayTotals.set(hit.day, (dayTotals.get(hit.day) ?? 0) + count);
    totals.visits += count;
    totals[hit.device] += count;
    if (row.kind === 'qr') totals.qr += count;
    else totals.link += count;
  }
  return {
    rows: [...rows.values()].sort((a, b) => b.visits - a.visits || a.placement.localeCompare(b.placement)),
    totals,
    days: [...dayTotals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, visits]) => ({ day, visits })),
  };
}
