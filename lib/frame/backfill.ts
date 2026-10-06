/**
 * Rollout of the generated default frame to the events that already exist (docs/DEFAULT_FRAME_PLAN.md, camera#238).
 *
 * Which events: every event with no active frame of its own and no generated images yet. Events with an own active
 * frame are never touched, events that already have images are skipped, so a run can be repeated and an interrupted
 * run continues where it stopped. `dryRun` writes nothing (and, with `probe`, only reads from messmass); `runBackfillBatch`
 * takes the snapshot and draws the images for a few events per call, within a time budget, and reports failures per
 * event without stopping. A linked event whose messmass answer is missing is not drawn from camera's fallback; it waits. Dependencies are injected so it is unit-tested without a network or a database server.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fetchFrameContext, messmassConfigured } from '@/lib/messmassClient';
import { parseFrameContext } from './context';
import { splitMatchName } from './layout';
import { refreshFrameDesign } from './sync';
import { generateFrameVariants } from './variants';

export type Classification =
  | { kind: 'own-frame' }
  | { kind: 'done' }
  | { kind: 'todo'; linked: boolean; hasSnapshot: boolean; inactive: boolean };

/** What the rollout does with one event. Pure. */
export function classifyEvent(event: Document): Classification {
  const frames = Array.isArray(event.frames) ? (event.frames as Array<{ isActive?: boolean }>) : [];
  if (frames.some((frame) => frame?.isActive)) return { kind: 'own-frame' };
  const variants = Array.isArray(event.frameDesign?.variants) ? (event.frameDesign.variants as Array<{ imageUrl?: unknown }>) : [];
  if (variants.some((variant) => typeof variant?.imageUrl === 'string' && variant.imageUrl)) return { kind: 'done' };
  return {
    kind: 'todo',
    linked: typeof event.messmassEventId === 'string' && event.messmassEventId.trim() !== '',
    hasSnapshot: Boolean(event.frameDesign?.context),
    inactive: event.isActive === false,
  };
}

export interface ProbeReport {
  /** Linked events asked (read-only GET to messmass). */
  asked: number;
  answered: number;
  unavailable: number;
  /** Where the effective theme came from, `project`, `partner`, `template` or `system-default`. */
  styleFrom: Record<string, number>;
  withLogo: number;
  withoutLogo: number;
  /** What the teams text will show: both real teams, a pairing in the event name, or the event name as it is. */
  teams: { both: number; pairingInName: number; nameOnly: number };
  customFont: number;
  /** A few event names to look at. */
  examples: { withoutLogo: string[]; nameOnly: string[] };
  /** The probe stopped at its time or count limit; the numbers cover the events asked. */
  incomplete: boolean;
}

export interface BackfillReport {
  total: number;
  /** Untouched: an active frame of their own. */
  ownFrame: number;
  /** Skipped: generated images exist already. */
  done: number;
  todo: number;
  todoLinked: number;
  /** No messmass link: the frame is built from camera's own name and partner logo, no teams, the system theme. */
  todoNative: number;
  todoInactive: number;
  /** To do, but a snapshot exists already (images are missing). */
  todoWithSnapshot: number;
  /** Camera-native events whose camera partner has no logo, so the frame has none. */
  nativeWithoutPartnerLogo: number;
  messmassConfigured: boolean;
  probe?: ProbeReport;
}

export interface BackfillDeps {
  fetchContext: (messmassEventId: string) => Promise<unknown | null>;
  messmassConfigured: () => boolean;
  refresh: typeof refreshFrameDesign;
  generate: typeof generateFrameVariants;
  now: () => number;
}

const defaultDeps: BackfillDeps = {
  fetchContext: fetchFrameContext,
  messmassConfigured,
  refresh: refreshFrameDesign,
  generate: generateFrameVariants,
  now: () => Date.now(),
};

const PROJECTION = { name: 1, messmassEventId: 1, frames: 1, isActive: 1, partnerId: 1, 'frameDesign.context': 1, 'frameDesign.variants.imageUrl': 1 };
const sortKey = (event: Document) => String(event._id);

async function listEvents(db: Db): Promise<Document[]> {
  return (await db.collection(COLLECTIONS.EVENTS).find({}, { projection: PROJECTION }).toArray()).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
}

const PROBE_CONCURRENCY = 6;
const PROBE_MAX = 400;
const PROBE_BUDGET_MS = 40_000;

async function probe(todo: Document[], deps: BackfillDeps): Promise<ProbeReport> {
  const report: ProbeReport = {
    asked: 0,
    answered: 0,
    unavailable: 0,
    styleFrom: {},
    withLogo: 0,
    withoutLogo: 0,
    teams: { both: 0, pairingInName: 0, nameOnly: 0 },
    customFont: 0,
    examples: { withoutLogo: [], nameOnly: [] },
    incomplete: false,
  };
  const linked = todo.filter((event) => classifyEvent(event).kind === 'todo' && (classifyEvent(event) as { linked: boolean }).linked);
  const started = deps.now();
  const queue = linked.slice(0, PROBE_MAX);
  report.incomplete = linked.length > PROBE_MAX;
  const note = (list: string[], name: string) => {
    if (list.length < 8) list.push(name);
  };

  const worker = async () => {
    for (let event = queue.shift(); event; event = queue.shift()) {
      if (deps.now() - started > PROBE_BUDGET_MS) {
        report.incomplete = true;
        return;
      }
      report.asked += 1;
      const raw = await deps.fetchContext(String(event.messmassEventId)).catch(() => null);
      const context = raw ? parseFrameContext(raw, new Date(deps.now()).toISOString()) : null;
      if (!context) {
        report.unavailable += 1;
        continue;
      }
      report.answered += 1;
      report.styleFrom[context.style.resolvedFrom] = (report.styleFrom[context.style.resolvedFrom] ?? 0) + 1;
      if (context.partner?.logoUrl) report.withLogo += 1;
      else {
        report.withoutLogo += 1;
        note(report.examples.withoutLogo, context.event.name);
      }
      if (context.event.homeTeam && context.event.visitorTeam) report.teams.both += 1;
      else if (splitMatchName(context.event.name)) report.teams.pairingInName += 1;
      else {
        report.teams.nameOnly += 1;
        note(report.examples.nameOnly, context.event.name);
      }
      if (context.style.fontSource === 'custom') report.customFont += 1;
    }
  };
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
  return report;
}

/**
 * What a run would do, without doing it. Reads the events, the partners of camera-native events and, when `probe` is
 * set, one read-only answer from messmass per linked event; nothing is written and nothing is drawn.
 */
export async function dryRun(db: Db, options: { probe?: boolean } = {}, deps: BackfillDeps = defaultDeps): Promise<BackfillReport> {
  const events = await listEvents(db);
  const report: BackfillReport = {
    total: events.length,
    ownFrame: 0,
    done: 0,
    todo: 0,
    todoLinked: 0,
    todoNative: 0,
    todoInactive: 0,
    todoWithSnapshot: 0,
    nativeWithoutPartnerLogo: 0,
    messmassConfigured: deps.messmassConfigured(),
  };
  const todo: Document[] = [];
  for (const event of events) {
    const c = classifyEvent(event);
    if (c.kind === 'own-frame') report.ownFrame += 1;
    else if (c.kind === 'done') report.done += 1;
    else {
      report.todo += 1;
      todo.push(event);
      if (c.linked) report.todoLinked += 1;
      else report.todoNative += 1;
      if (c.inactive) report.todoInactive += 1;
      if (c.hasSnapshot) report.todoWithSnapshot += 1;
    }
  }

  const nativePartnerIds = todo.filter((event) => !(classifyEvent(event) as { linked: boolean }).linked).map((event) => event.partnerId).filter(Boolean);
  if (nativePartnerIds.length > 0) {
    const partners = await db.collection(COLLECTIONS.PARTNERS).find({ partnerId: { $in: nativePartnerIds } }, { projection: { partnerId: 1, logoUrl: 1 } }).toArray();
    const withLogo = new Set(partners.filter((p) => typeof p.logoUrl === 'string' && p.logoUrl.trim()).map((p) => p.partnerId));
    report.nativeWithoutPartnerLogo = todo.filter((event) => !(classifyEvent(event) as { linked: boolean }).linked && !withLogo.has(event.partnerId)).length;
  } else {
    report.nativeWithoutPartnerLogo = todo.filter((event) => !(classifyEvent(event) as { linked: boolean }).linked).length;
  }

  if (options.probe && report.messmassConfigured) report.probe = await probe(todo, deps);
  return report;
}

export interface BatchResult {
  /** Events worked on in this call (drawn, or skipped because they changed meanwhile). */
  processed: number;
  /** Events that now have images. */
  completed: number;
  /** Images drawn and images reused in this call. */
  imagesDrawn: number;
  imagesReused: number;
  failures: Array<{ id: string; name: string; error: string }>;
  /**
   * Linked events skipped because messmass gave no usable answer (or is not configured). They get no images from the
   * camera fallback: they stay to do, and a later run takes them once messmass answers.
   */
  waiting: Array<{ id: string; name: string }>;
  /** Pass this as `after` to continue; null when nothing is left after this call. */
  nextAfter: string | null;
  /** Events still to do after this call's last event (failed ones are only retried by a new run from the start). */
  remaining: number;
  done: boolean;
}

/**
 * Takes the snapshot and draws the images for the next events that have none, `limit` at most, and no new event is
 * started once `budgetMs` has passed. A failing event is reported and skipped; it stays to do for the next run.
 */
export async function runBackfillBatch(
  db: Db,
  options: { limit: number; after?: string | null; budgetMs: number },
  deps: BackfillDeps = defaultDeps
): Promise<BatchResult> {
  const started = deps.now();
  const events = await listEvents(db);
  const todo = events.filter((event) => classifyEvent(event).kind === 'todo' && (!options.after || sortKey(event) > options.after));

  const result: BatchResult = { processed: 0, completed: 0, imagesDrawn: 0, imagesReused: 0, failures: [], waiting: [], nextAfter: null, remaining: 0, done: false };
  let last: string | null = options.after ?? null;
  let taken = 0;

  for (const listed of todo) {
    if (taken >= options.limit || (taken > 0 && deps.now() - started > options.budgetMs)) break;
    taken += 1;
    last = sortKey(listed);
    result.processed += 1;
    try {
      // The full document: what the refresh and the renderer read is not in the listing's projection.
      const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: listed._id });
      const current = event ? classifyEvent(event) : null;
      if (!event || current?.kind !== 'todo') continue;
      const waiting = () => result.waiting.push({ id: String(listed._id), name: String(listed.name ?? '') });
      // A linked event is drawn from messmass data or not at all: camera's own fallback would show no teams and the
      // system theme, and the event would then count as done.
      if (current.linked && !deps.messmassConfigured()) {
        waiting();
        continue;
      }
      const { design, messmassUnavailable } = await deps.refresh(db, event);
      if (current.linked && messmassUnavailable) {
        waiting();
        continue;
      }
      const images = await deps.generate(db, { ...event, frameDesign: design });
      result.completed += 1;
      result.imagesDrawn += images.generated;
      result.imagesReused += images.reused;
    } catch (error) {
      console.error(`Frame backfill: event ${String(listed._id)} failed`, error);
      result.failures.push({ id: String(listed._id), name: String(listed.name ?? ''), error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  result.remaining = todo.filter((event) => last !== null && sortKey(event) > last).length;
  result.done = result.remaining === 0;
  result.nextAfter = result.done ? null : last;
  return result;
}
