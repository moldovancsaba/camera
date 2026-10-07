/**
 * What the admin sees of a tracked link (camera#320): the link, its full address, and what has been counted on it. Pure, unit-tested (view.test.ts).
 */

import type { LinkCounts, ShortLinkDoc } from './store';

export const NO_COUNTS: LinkCounts = { total: 0, android: 0, iphone: 0, other: 0, today: 0 };

export interface ShortLinkView extends ShortLinkDoc {
  url: string;
  counts: LinkCounts;
}

export function toLinkView(origin: string, link: ShortLinkDoc, counts: Record<string, LinkCounts>): ShortLinkView {
  return { ...link, url: `${origin}/${link.slug}`, counts: counts[link.slug] ?? NO_COUNTS };
}

/** The event's own short URL, counted like a plain link; null when the event has none. */
export function eventShortUrlView(origin: string, slug: string | null | undefined, counts: Record<string, LinkCounts>): { slug: string; url: string; counts: LinkCounts } | null {
  const clean = typeof slug === 'string' ? slug.trim() : '';
  return clean ? { slug: clean, url: `${origin}/${clean}`, counts: counts[clean] ?? NO_COUNTS } : null;
}
