/**
 * The backfill of the default slideshow and the welcome page screen picture for the events that already exist (issue 326, issue 327; owner question 180). Only a new event gets them by itself
 * (`lib/screen/new-event-screen.ts`); the existing events have neither until somebody runs this, from the card **Welcome page screens for existing events** on the Slideshows page.
 *
 * - **The dry run (`planBackfill`) reads and writes nothing.** It lists the events that have no picture yet, with what a run would do to each and what the users of the event would see
 *   differently afterwards, and counts them (all, upcoming, inactive, with a visible change). Nothing is selected by default: the person who runs it chooses the events.
 * - **The run (`runBackfill`) works on the events it is given, never on "all".** For each it makes the default slideshow when the event has none (with its tracked "Giant screen" link and the
 *   stage picture) and draws the welcome page screen picture (`ensureWelcomeScreen`). It adds; it deletes nothing and changes no page: a welcome page's own picture is never touched. An event
 *   that already has the picture is skipped, so it is safe to repeat; a failure is reported for that event and the others go on, and a failed event is still eligible next time.
 * - **What a user sees afterwards (`BackfillChange`):** the picture on the event brings a *default welcome page* to an event that gets the journey defaults and has no welcome page of its own
 *   (`withDefaultJourneyPages`), and the drawn picture on a welcome page that has no picture of its own (`welcomeScreenImage`). That is why the plan says it per event.
 *
 * Dependencies are injected so it is unit-tested without Blob, a network or a database.
 */

import { ObjectId, type Db, type Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { eventGetsDefaults, getDefaultsRollout } from '@/lib/admin/defaults-rollout';
import { ensureDefaultSlideshow, type DefaultSlideshowDeps } from '@/lib/slideshow/default-slideshow';
import { ensureWelcomeScreen, type WelcomeScreenDeps } from './welcome-screen-store';

/** At most this many events are made in one call, and no new event is started after this long (the card calls again for the rest). */
export const BACKFILL_MAX_EVENTS_PER_CALL = 4;
export const BACKFILL_BUDGET_MS = 40_000;
/** The most event ids one call accepts. */
export const BACKFILL_MAX_IDS = 400;

/** What the users of the event see differently once it has the picture. */
export type BackfillChange =
  /** The event gets the journey defaults and has no welcome page of its own: the default welcome page (giant screen and Start button) becomes its first page. */
  | 'default-welcome-page'
  /** It has a welcome page whose giant screen picture is not its own: that page shows the drawn picture. */
  | 'picture-on-welcome-page'
  /** Nothing the users see changes (the welcome page keeps its own picture, or the event does not get the defaults). */
  | 'none';

export interface BackfillRow {
  /** The Mongo _id of the event (what the run is given). */
  id: string;
  eventId: string;
  name: string;
  partnerName: string;
  eventDate: string | null;
  /** The event day is today or later. */
  upcoming: boolean;
  isActive: boolean;
  /** The event has its default slideshow already (a run then only draws the picture). */
  hasDefaultSlideshow: boolean;
  change: BackfillChange;
}

export interface BackfillPlan {
  today: string;
  /** The global journey defaults switch (lib/admin/defaults-rollout.ts): on means every event gets the default welcome page when it has the picture. */
  rolloutOn: boolean;
  totals: {
    events: number;
    withPicture: number;
    toDo: number;
    toDoUpcoming: number;
    toDoInactive: number;
    toDoWithoutSlideshow: number;
    toDoWithVisibleChange: number;
  };
  /** The events that have no picture yet: upcoming first, then by event date, newest first. */
  rows: BackfillRow[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The start of today in UTC, as a number, for comparing event days. */
function startOfDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** True when the event day (ISO date or date and time) is today or later; an event with no date, or one that is not a date, is not upcoming. */
export function isUpcoming(eventDate: unknown, now: Date): boolean {
  const day = text(eventDate);
  if (!day) return false;
  const at = Date.parse(day);
  return Number.isFinite(at) && at >= startOfDay(now);
}

/** What the users would see differently once the event has the picture (see `BackfillChange`). Pure. */
export function changeFor(event: Document, rolloutOn: boolean): BackfillChange {
  const pages = (Array.isArray(event.customPages) ? event.customPages : []) as Array<{ pageType?: unknown; isActive?: unknown; config?: { screenImageUrl?: unknown } }>;
  const welcome = pages.filter((page) => page?.pageType === 'welcome');
  if (welcome.length === 0) return eventGetsDefaults(event, { applyToExistingEvents: rolloutOn }) ? 'default-welcome-page' : 'none';
  return welcome.some((page) => page.isActive !== false && !text(page.config?.screenImageUrl)) ? 'picture-on-welcome-page' : 'none';
}

const hasPicture = (event: Document): boolean => typeof (event.welcomeScreen as { url?: unknown } | undefined)?.url === 'string' && text((event.welcomeScreen as { url: string }).url) !== '';

/** The dry run: reads the events, the default slideshows and the switch, and writes nothing. */
export async function planBackfill(db: Db, now: Date = new Date()): Promise<BackfillPlan> {
  const [events, slideshows, rollout] = await Promise.all([
    db
      .collection(COLLECTIONS.EVENTS)
      .find({}, { projection: { eventId: 1, name: 1, partnerName: 1, eventDate: 1, isActive: 1, journeyDefaults: 1, 'welcomeScreen.url': 1, 'customPages.pageType': 1, 'customPages.isActive': 1, 'customPages.config.screenImageUrl': 1 } })
      .toArray(),
    db.collection(COLLECTIONS.SLIDESHOWS).find({ isDefault: true }, { projection: { eventId: 1 } }).toArray(),
    getDefaultsRollout(db),
  ]);
  const withSlideshow = new Set(slideshows.map((row) => text(row.eventId)));
  const rows: BackfillRow[] = [];
  let withPicture = 0;
  for (const event of events) {
    if (hasPicture(event)) {
      withPicture += 1;
      continue;
    }
    const eventId = text(event.eventId);
    if (!eventId) continue;
    rows.push({
      id: String(event._id),
      eventId,
      name: text(event.name) || eventId,
      partnerName: text(event.partnerName),
      eventDate: text(event.eventDate) || null,
      upcoming: isUpcoming(event.eventDate, now),
      isActive: event.isActive !== false,
      hasDefaultSlideshow: withSlideshow.has(eventId),
      change: changeFor(event, rollout.applyToExistingEvents),
    });
  }
  // Upcoming events first (soonest first), then the others, the most recent first: the ones somebody looks for are at the top.
  rows.sort((a, b) => Number(b.upcoming) - Number(a.upcoming) || (a.upcoming ? (a.eventDate ?? '').localeCompare(b.eventDate ?? '') : (b.eventDate ?? '').localeCompare(a.eventDate ?? '')) || a.name.localeCompare(b.name));
  return {
    today: new Date(startOfDay(now)).toISOString().slice(0, 10),
    rolloutOn: rollout.applyToExistingEvents,
    totals: {
      events: events.length,
      withPicture,
      toDo: rows.length,
      toDoUpcoming: rows.filter((row) => row.upcoming).length,
      toDoInactive: rows.filter((row) => !row.isActive).length,
      toDoWithoutSlideshow: rows.filter((row) => !row.hasDefaultSlideshow).length,
      toDoWithVisibleChange: rows.filter((row) => row.change !== 'none').length,
    },
    rows,
  };
}

export type BackfillOutcome = 'drawn' | 'already-done' | 'not-found' | 'failed';

export interface BackfillResult {
  id: string;
  name: string;
  outcome: BackfillOutcome;
  /** The default slideshow was made by this run. */
  slideshowMade: boolean;
  /** Why it failed. */
  reason?: string;
}

export interface BackfillDeps {
  slideshow?: DefaultSlideshowDeps;
  screen?: WelcomeScreenDeps;
  now?: () => number;
}

export interface BackfillRun {
  results: BackfillResult[];
  /** The ids given that this call did not get to (the card calls again with them). */
  remaining: string[];
  counts: Record<BackfillOutcome, number>;
}

/** Makes the default slideshow and the picture of one event. Never throws. */
export async function backfillEvent(db: Db, event: Document, deps: BackfillDeps = {}): Promise<BackfillResult> {
  const base = { id: String(event._id), name: text(event.name) || text(event.eventId) };
  let slideshowMade = false;
  try {
    if (hasPicture(event)) return { ...base, outcome: 'already-done', slideshowMade };
    const slideshow = await ensureDefaultSlideshow(db, event, deps.slideshow);
    if (!slideshow.ok) return { ...base, outcome: 'failed', slideshowMade, reason: slideshow.reason };
    slideshowMade = slideshow.created;
    const screen = await ensureWelcomeScreen(db, event, deps.screen);
    if (!screen.ok) return { ...base, outcome: 'failed', slideshowMade, reason: screen.reason };
    return { ...base, outcome: 'drawn', slideshowMade };
  } catch (error) {
    return { ...base, outcome: 'failed', slideshowMade, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The run: the given events, one after the other, as many as fit in one call. Ids that are not events are reported (`not-found`), an event that already has the picture is skipped
 * (`already-done`), a failure is reported and does not stop the others.
 */
export async function runBackfill(db: Db, ids: readonly string[], deps: BackfillDeps = {}, limits: { maxEvents?: number; budgetMs?: number } = {}): Promise<BackfillRun> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const maxEvents = limits.maxEvents ?? BACKFILL_MAX_EVENTS_PER_CALL;
  const budgetMs = limits.budgetMs ?? BACKFILL_BUDGET_MS;
  const unique = [...new Set(ids)];
  const results: BackfillResult[] = [];
  let done = 0;
  let next = 0;
  for (; next < unique.length; next += 1) {
    if (done >= maxEvents || now() - startedAt > budgetMs) break;
    const id = unique[next];
    const event = ObjectId.isValid(id) ? await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(id) }) : null;
    if (!event) {
      results.push({ id, name: '', outcome: 'not-found', slideshowMade: false });
      continue;
    }
    const result = await backfillEvent(db, event, deps);
    results.push(result);
    // An event that only had to be skipped costs nothing; one that was made counts against the limit.
    if (result.outcome !== 'already-done') done += 1;
  }
  const counts: Record<BackfillOutcome, number> = { drawn: 0, 'already-done': 0, 'not-found': 0, failed: 0 };
  for (const result of results) counts[result.outcome] += 1;
  return { results, remaining: unique.slice(next), counts };
}
