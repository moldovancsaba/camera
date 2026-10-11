/**
 * The welcome page screen picture follows its sources (issue 327; plan items 24 and 28: "regenerated automatically whenever a source element changes. It is always the latest generated").
 *
 * The picture (`Event.welcomeScreen`, lib/screen/welcome-screen-store.ts) is drawn from the default slideshow's screen design, the event's colours and font, its frame and the sample selfie in the
 * window. A slideshow save and the buttons of the Welcome page screen card already draw it. This module draws it again when one of the other sources is **changed by an editor**: the event's
 * colours (brand colours, the Start button's colours), its generated frame (which carries the messmass style snapshot, so also the colours and the font that come from messmass), and the sample
 * selfie at the event or partner level. It is called from the places those are written (see the callers of `scheduleWelcomeRedraw`).
 *
 * The rules (owner, before the match of 2026-10-16: "nothing may change for any live event by itself"):
 *  - **Only on a change.** Nothing in this module runs on a timer, on a visit or on deploy. A trigger that finds that nothing the picture is drawn from changed draws nothing: the stored picture has
 *    a `key` that is the hash of everything it is drawn from (`ensureWelcomeScreen`), so a redraw with the same sources is a read, not a draw.
 *  - **Only an event that has the picture already.** An event without `Event.welcomeScreen` is never given one by this (that is the backfill, an admin's choice behind a dry run):
 *    drawing it would also give the event a default welcome page. The default slideshow is never made here either, and there is no way to ask this module for either.
 *  - **Never blocks the save.** The work is scheduled with `after()`, so the response is already sent; every failure is logged and swallowed.
 *  - **Debounced.** The first change waits `REDRAW_DEBOUNCE_MS` and then reads the event as it is stored *then*, so an editor who changes five things in a row gets one draw; a change that comes while a
 *    draw runs gets one more after it (at most `REDRAW_MAX_RERUNS` more). The state is per server instance: two instances may both draw, which costs nothing wrong (the second sees the same key, or
 *    overwrites the same file with the same bytes).
 *  - **Bounded.** One draw at a time per server instance, each cut off after `REDRAW_TIMEOUT_MS`; at most `REDRAW_MAX_WAITING` events wait in one instance (the others keep their picture and the
 *    Draw button redraws them); a change at the partner level (it reaches all the partner's events) draws at most `REDRAW_PARTNER_MAX_EVENTS` events and stops after `REDRAW_PARTNER_BUDGET_MS`.
 *  - **A switch.** `WELCOME_SCREEN_AUTO_REDRAW=off` on the Vercel project turns all of it off at once (the slideshow save and the buttons still draw).
 * A page's own `screenImageUrl` is never touched (ensureWelcomeScreen).
 */

import { after } from 'next/server';
import { ObjectId, type Db, type Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { connectToDatabase } from '@/lib/db/mongodb';
import { logInfo, logWarn } from '@/lib/observability/logger';
import { welcomeButtonColours } from '@/lib/theme/welcome-buttons';
import type { WelcomeScreenDeps } from './welcome-screen-store';

/** How long the first change waits for more changes before the picture is drawn. */
export const REDRAW_DEBOUNCE_MS = 2500;
/** A draw that takes longer is given up (it is logged; the Draw button redraws). */
export const REDRAW_TIMEOUT_MS = 25_000;
/** Events that may wait for a draw in one server instance. */
export const REDRAW_MAX_WAITING = 40;
/** Draws one change may be followed by while the event keeps changing. */
export const REDRAW_MAX_RERUNS = 2;
/** A change at the partner level reaches at most this many events at once, and stops after this long. */
export const REDRAW_PARTNER_MAX_EVENTS = 25;
export const REDRAW_PARTNER_BUDGET_MS = 40_000;

export type RedrawReason = 'frame' | 'colours' | 'style' | 'sample-selfie' | 'partner-colours' | 'partner-sample-selfie';

/** False when `WELCOME_SCREEN_AUTO_REDRAW` is `off`, `0`, `false` or `no`: nothing in this module then draws anything. */
export function autoRedrawEnabled(setting: string | undefined = process.env.WELCOME_SCREEN_AUTO_REDRAW): boolean {
  return !/^(off|0|false|no)$/i.test((setting ?? '').trim());
}

/** True when the event has a stored welcome page screen picture (the only kind of event an automatic redraw touches). */
export function hasStoredPicture(event: { welcomeScreen?: unknown } | null | undefined): boolean {
  const stored = event?.welcomeScreen as { url?: unknown } | undefined;
  return typeof stored?.url === 'string' && stored.url.length > 0;
}

/**
 * The colour inputs an editor can change on the event that the picture is drawn from: the brand colours and the colours of the Start button of the welcome page. Compare before and after a save:
 * different means the event's colours were changed (the style from messmass is a separate source, in the frame design).
 */
export function colourInputsOf(event: Document | null | undefined): string {
  return JSON.stringify([event?.brandColor ?? null, event?.brandBorderColor ?? null, welcomeButtonColours(event?.customPages)]);
}

export type RedrawOutcome = { status: 'redrawn'; url: string } | { status: 'unchanged' } | { status: 'skipped'; reason: string } | { status: 'failed'; reason: string };

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`took longer than ${ms} ms`)), ms);
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/**
 * Draws the picture of an event now, unless it has none (then nothing is done) or it is drawn from the same things already (then it is read, not drawn). Never throws.
 */
export async function redrawEvent(db: Db, event: Document | null | undefined, options: { deps?: WelcomeScreenDeps; timeoutMs?: number } = {}): Promise<RedrawOutcome> {
  if (!event) return { status: 'skipped', reason: 'the event is gone' };
  if (!hasStoredPicture(event)) return { status: 'skipped', reason: 'the event has no welcome page screen picture' };
  try {
    // Loaded when a draw is due, not when the routes that schedule one are loaded: the renderer, the fonts and the theme loader are heavy and most requests that schedule never get here.
    const { ensureWelcomeScreen } = await import('./welcome-screen-store');
    const result = await withTimeout(ensureWelcomeScreen(db, event, options.deps), options.timeoutMs ?? REDRAW_TIMEOUT_MS);
    if (!result.ok) return { status: 'skipped', reason: result.reason };
    return result.created ? { status: 'redrawn', url: result.url } : { status: 'unchanged' };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

interface Entry {
  rerun: boolean;
  phase: 'waiting' | 'running';
  reasons: Set<string>;
  promise: Promise<void>;
}

export interface SchedulerOptions {
  debounceMs: number;
  maxWaiting: number;
  maxReruns: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Draws the event with this key (its Mongo id) now, reading it as stored now. */
  run: (key: string, reasons: string[]) => Promise<void>;
  onDropped?: (key: string) => void;
}

/**
 * The debounce and the queue of one server instance. `request` returns a promise that settles when the event's draw (or its give-up) is done, so `after()` keeps the function alive for it. A request
 * for an event that is already waiting joins it (the draw reads the event when it starts, so it sees every change made while it waited); one that comes while the event is drawn asks for one more draw.
 * One draw at a time, in the order the waits end. Never rejects.
 */
export function createRedrawScheduler(options: SchedulerOptions) {
  const entries = new Map<string, Entry>();
  let chain: Promise<unknown> = Promise.resolve();

  function request(key: string, reason = 'change', notAfter = Number.POSITIVE_INFINITY): Promise<void> {
    const existing = entries.get(key);
    if (existing) {
      existing.reasons.add(reason);
      if (existing.phase === 'running') existing.rerun = true;
      return existing.promise;
    }
    if (entries.size >= options.maxWaiting) {
      options.onDropped?.(key);
      return Promise.resolve();
    }
    const entry: Entry = { rerun: false, phase: 'waiting', reasons: new Set([reason]), promise: Promise.resolve() };
    entries.set(key, entry);
    entry.promise = (async () => {
      try {
        for (let round = 0; round <= options.maxReruns; round += 1) {
          entry.phase = 'waiting';
          entry.rerun = false;
          await options.sleep(options.debounceMs);
          const turn = chain.then(async () => {
            entry.phase = 'running';
            if (options.now() > notAfter) return;
            await options.run(key, [...entry.reasons]).catch(() => undefined);
          });
          chain = turn.catch(() => undefined);
          await turn;
          if (!entry.rerun) break;
        }
      } finally {
        entries.delete(key);
      }
    })();
    return entry.promise;
  }

  return { request, waiting: () => entries.size };
}

async function runOne(mongoId: string, reasons: string[]): Promise<void> {
  try {
    const db = await connectToDatabase();
    const event = ObjectId.isValid(mongoId) ? await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(mongoId) }) : null;
    const outcome = await redrawEvent(db, event);
    if (outcome.status === 'redrawn') logInfo('welcome_screen.redrawn', 'The welcome page screen picture was drawn again after a change', { eventId: String(event?.eventId ?? ''), reasons });
    else if (outcome.status === 'failed') logWarn('welcome_screen.redraw_failed', 'The welcome page screen picture could not be drawn again after a change', { eventId: String(event?.eventId ?? ''), reasons, reason: outcome.reason });
  } catch (error) {
    logWarn('welcome_screen.redraw_failed', 'The welcome page screen picture could not be drawn again after a change', { mongoId, reasons, reason: error instanceof Error ? error.message : String(error) });
  }
}

const scheduler = createRedrawScheduler({
  debounceMs: REDRAW_DEBOUNCE_MS,
  maxWaiting: REDRAW_MAX_WAITING,
  maxReruns: REDRAW_MAX_RERUNS,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  run: runOne,
  onDropped: (key) => logWarn('welcome_screen.redraw_dropped', 'Too many welcome page screens were waiting for a redraw; this one keeps its picture until the next change or the Draw button', { mongoId: key }),
});

/**
 * For after the response of a save that changed a source of the picture: the picture of this event is drawn again once the changes have stopped, if it has one. `event` is the event as the caller has
 * it (only `_id` and `welcomeScreen` are read, to decide whether there is anything to do at all). Outside a request (a script, a test) nothing is scheduled. Never throws.
 */
export function scheduleWelcomeRedraw(event: { _id?: unknown; welcomeScreen?: unknown } | null | undefined, reason: RedrawReason): void {
  try {
    if (!autoRedrawEnabled() || !event?._id || !hasStoredPicture(event)) return;
    const key = String(event._id);
    after(() => scheduler.request(key, reason));
  } catch {
    // not in a request: the picture is drawn when an admin asks for it
  }
}

/**
 * The same for a change at the partner level, which reaches every event that follows the partner: the events of the partner that have a picture are drawn again, a few at a time and within a time
 * budget (see the limits above). An event that does not follow (it has its own choice) finds that nothing it is drawn from changed and draws nothing.
 */
export function scheduleWelcomeRedrawForPartner(partnerId: string | null | undefined, reason: RedrawReason): void {
  try {
    if (!autoRedrawEnabled() || !partnerId) return;
    after(async () => {
      try {
        const db = await connectToDatabase();
        const rows = await db.collection(COLLECTIONS.EVENTS).find({ partnerId, 'welcomeScreen.url': { $exists: true } }, { projection: { _id: 1 } }).limit(REDRAW_PARTNER_MAX_EVENTS + 1).toArray();
        if (rows.length > REDRAW_PARTNER_MAX_EVENTS) logWarn('welcome_screen.redraw_capped', 'A change at the partner level reaches more events than are redrawn at once; the others keep their picture until their next change or the Draw button', { partnerId, limit: REDRAW_PARTNER_MAX_EVENTS });
        const notAfter = Date.now() + REDRAW_PARTNER_BUDGET_MS;
        await Promise.all(rows.slice(0, REDRAW_PARTNER_MAX_EVENTS).map((row) => scheduler.request(String(row._id), reason, notAfter)));
      } catch (error) {
        logWarn('welcome_screen.redraw_failed', 'The welcome page screens of a partner could not be drawn again after a change', { partnerId, reason: error instanceof Error ? error.message : String(error) });
      }
    });
  } catch {
    // not in a request
  }
}
