/**
 * The link an e-mail gives to the event itself (owner, 2026-10-09: "when we have a slug, we always use those links set in the editor as the default behaviour"): the event's own short
 * link `<go origin>/<slug>` when the editor set a URL slug (it sends the user on to the capture page and is counted as a link visit, docs/SHORT_LINKS.md), else the capture page of
 * the event. Used for the "take another photo" link of the not-approved e-mail and for the `{eventlink}` variable. Pure apart from the two origins it reads from the environment.
 */

import { defaultGoShortOrigin } from '@/lib/site-hosts';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { eventFactsOf, type EventFacts } from '@/lib/email/variables';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The event's own short link, or null when the event has no usable slug. */
export function shortLinkOf(event: { shortUrlSlug?: unknown } | null | undefined, goOrigin: string = defaultGoShortOrigin()): string | null {
  const slug = typeof event?.shortUrlSlug === 'string' ? event.shortUrlSlug.trim().toLowerCase() : '';
  return SLUG.test(slug) ? `${goOrigin.replace(/\/$/, '')}/${slug}` : null;
}

/** The capture page of an event by its key (its id, or its uuid). */
export function captureLinkOf(eventKey: string, siteUrl: string = getConfiguredSiteUrl()): string {
  return `${siteUrl.replace(/\/$/, '')}/capture/${encodeURIComponent(eventKey)}`;
}

/** The link to the event for an e-mail: its short link when it has a slug, else its capture page; null when it has neither a slug nor a key. */
export function eventLinkOf(event: { shortUrlSlug?: unknown; eventId?: unknown; _id?: unknown } | null | undefined): string | null {
  const short = shortLinkOf(event);
  if (short) return short;
  const key = typeof event?.eventId === 'string' && event.eventId ? event.eventId : event?._id ? String(event._id) : '';
  return key ? captureLinkOf(key) : null;
}

/** What an e-mail knows about an event for its variables: the facts of the event document, and its link. */
export function emailFactsOf(event: unknown): EventFacts {
  const link = eventLinkOf(event as { shortUrlSlug?: unknown; eventId?: unknown; _id?: unknown } | null);
  return { ...eventFactsOf(event), ...(link ? { eventLink: link } : {}) };
}
