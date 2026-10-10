/**
 * The address of the Analytics view (issue 521): which tab, which days, which clock, and which event on the all-events page. Pure; unit-tested in query.test.ts.
 * The page is a plain link (no state in the browser), so every tab link carries the filters and a report can be shared as an address.
 */

import { resolveTimeZone } from './time';

export const ANALYTICS_VIEWS = ['overview', 'photos', 'vetting', 'screens', 'sources', 'emails', 'messmass', 'tryon'] as const;
export type AnalyticsViewId = (typeof ANALYTICS_VIEWS)[number];

export const isAnalyticsView = (value: unknown): value is AnalyticsViewId => typeof value === 'string' && (ANALYTICS_VIEWS as readonly string[]).includes(value);

export interface AnalyticsQuery {
  view: AnalyticsViewId;
  from: string;
  to: string;
  timeZone: string;
  /** The event picked on the all-events page (its UUID or Mongo id); empty on an event's own page. */
  eventId: string;
}

const day = (value: unknown): string => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : '');
const one = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export function parseAnalyticsQuery(params: Record<string, string | string[] | undefined>, defaultTimeZone: string): AnalyticsQuery {
  const view = one(params.view);
  return {
    view: isAnalyticsView(view) ? view : 'overview',
    from: day(one(params.from)),
    to: day(one(params.to)),
    timeZone: resolveTimeZone(one(params.tz), defaultTimeZone),
    eventId: (one(params.eventId) ?? '').trim(),
  };
}

/** The address of a view with the filters of a query (empty ones left out); `overrides` change some of them (a tab link changes `view`). */
export function analyticsHref(basePath: string, query: AnalyticsQuery, overrides: Partial<AnalyticsQuery> = {}, defaultTimeZone = 'UTC'): string {
  const merged = { ...query, ...overrides };
  const search = new URLSearchParams();
  if (merged.view !== 'overview') search.set('view', merged.view);
  if (merged.eventId) search.set('eventId', merged.eventId);
  if (merged.from) search.set('from', merged.from);
  if (merged.to) search.set('to', merged.to);
  if (merged.timeZone !== defaultTimeZone) search.set('tz', merged.timeZone);
  const text = search.toString();
  return text ? `${basePath}?${text}` : basePath;
}
