/**
 * What fills the photo window of the welcome page screen (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md; owner answers 255 to 260): the event's **sample selfie** by default, or the drawn
 * **stand-in** when the editor chose to keep it. The sample selfie is one of what the event uses (`lib/slots/selfie-store.ts`: its own, its partner's, the global ones), **picked once and
 * stored** on the event (`Event.welcomeWindow.pick`) so the picture does not change on every redraw; it is picked again when it is no longer among them, when its picture cannot be fetched,
 * or when the editor asks (**Pick another**). A picture the registry knows is gone is never tried (`lib/media/pictures.ts`), and one that fails to load is skipped for the next, never an
 * error: with none left the stand-in is drawn. The sample selfie is drawn with the event's frame over it. Dependencies are injected so it is unit-tested without a network.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { brokenAddresses } from '@/lib/media/pictures';
import { resolveEventSelfieDocs } from '@/lib/slots/selfie-store';
import { pickSelfie } from '@/lib/slots/selfie';

export type WindowSource = 'selfie' | 'standin';
export const WINDOW_SOURCES: readonly WindowSource[] = ['selfie', 'standin'];

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** What the event's editor chose for the window: the sample selfie unless the stand-in was chosen. */
export function windowSourceOf(event: Document | null | undefined): WindowSource {
  return (event?.welcomeWindow as { source?: unknown } | undefined)?.source === 'standin' ? 'standin' : 'selfie';
}

/** What a request may set: `source` is a known one, `again` a true or false; nothing else. */
export function parseWindowRequest(input: unknown): { ok: true; value: { source?: WindowSource; again?: boolean } } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'A body with source and/or again is required.' };
  const { source, again, ...rest } = input as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false, reason: `Unknown field: ${Object.keys(rest)[0]}.` };
  if (source !== undefined && !WINDOW_SOURCES.includes(source as WindowSource)) return { ok: false, reason: `source must be one of: ${WINDOW_SOURCES.join(', ')}.` };
  if (again !== undefined && typeof again !== 'boolean') return { ok: false, reason: 'again must be true or false.' };
  return { ok: true, value: { ...(source !== undefined ? { source: source as WindowSource } : {}), ...(again !== undefined ? { again } : {}) } };
}

export interface WindowDeps {
  /** An https image of an allowed host, or null (lib/frame/logo.ts). */
  fetchImage: (url: string) => Promise<Buffer | null>;
  now: () => string;
  random?: () => number;
}

export interface WindowCandidate {
  id: string;
  url: string;
}

/** What the picture is drawn from: the order in which to try the sample selfies (the stored pick first), and the part of the key that says which is first. */
export interface WindowPlan {
  source: WindowSource;
  candidates: WindowCandidate[];
  /** For the stored picture's key: the source and, for a sample selfie, the first candidate's address (nothing is fetched to know it). */
  keyPart: string;
}

/**
 * Plans the window without fetching anything: the sample selfies the event uses, minus the ones known to be gone, with the stored pick first (a new pick is made when there is none or it
 * left the set, or when `again` asks for another). The result is deterministic for a given pick, so the key of the stored picture is stable.
 */
export async function planWindow(db: Db, event: Document, options: { again?: boolean; random?: () => number } = {}): Promise<WindowPlan> {
  const source = windowSourceOf(event);
  if (source === 'standin') return { source, candidates: [], keyPart: 'standin' };
  const [docs, gone] = await Promise.all([resolveEventSelfieDocs(db, event), brokenAddresses(db)]);
  const usable = docs.map((doc) => ({ id: text(doc.pictureId), url: text(doc.imageUrl) })).filter((item) => item.id && item.url && !gone.has(item.url));
  const stored = text((event.welcomeWindow as { pick?: { pictureId?: unknown } } | undefined)?.pick?.pictureId);
  const picked = pickSelfie(usable.map((item) => ({ id: item.id, level: 'event' })), stored, options);
  const ordered = picked ? [usable.find((item) => item.id === picked)!, ...usable.filter((item) => item.id !== picked)] : [];
  return { source, candidates: ordered, keyPart: ordered.length > 0 ? `selfie:${ordered[0].id}:${ordered[0].url}` : 'standin' };
}

export interface WindowChoice {
  /** What fills the window, or null for the stand-in. */
  picture: Buffer | null;
  /** The sample selfie that was fetched (and is stored as the pick), or null. */
  pickedId: string | null;
  /** The part of the key that matches what was really drawn (the first candidate that could be fetched). */
  keyPart: string;
}

/** Fetches the first candidate that can be fetched; the ones before it are skipped, never an error; with none the stand-in is drawn. */
export async function fetchWindow(plan: WindowPlan, deps: Pick<WindowDeps, 'fetchImage'>): Promise<WindowChoice> {
  for (const candidate of plan.candidates) {
    const picture = await deps.fetchImage(candidate.url);
    if (picture) return { picture, pickedId: candidate.id, keyPart: `selfie:${candidate.id}:${candidate.url}` };
  }
  return { picture: null, pickedId: null, keyPart: 'standin' };
}

/** Stores the pick on the event when it changed (a pick that is already stored writes nothing). */
export async function storePick(db: Db, event: Document, pickedId: string | null, now: string): Promise<void> {
  const stored = text((event.welcomeWindow as { pick?: { pictureId?: unknown } } | undefined)?.pick?.pictureId);
  if (!pickedId || pickedId === stored) return;
  await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: text(event.eventId) }, { $set: { 'welcomeWindow.pick': { pictureId: pickedId, pickedAt: now } } });
}

export interface WindowState {
  source: WindowSource;
  /** The sample selfie picked for this event, for the screen; null when none (the stand-in is drawn). */
  pick: { id: string; name: string; imageUrl: string | null } | null;
  /** The stored welcome page screen picture, if any. */
  welcomeScreen: { url: string; generatedAt: string } | null;
}

/** What the event card shows: the setting, the pick (with its name and picture) and the stored picture. */
export async function windowState(db: Db, event: Document): Promise<WindowState> {
  const pickedId = text((event.welcomeWindow as { pick?: { pictureId?: unknown } } | undefined)?.pick?.pictureId);
  const doc = pickedId ? await db.collection(COLLECTIONS.IMAGES).findOne({ pictureId: pickedId }) : null;
  const stored = event.welcomeScreen as { url?: unknown; generatedAt?: unknown } | undefined;
  return {
    source: windowSourceOf(event),
    pick: doc && doc.isActive !== false ? { id: pickedId, name: text(doc.name) || pickedId, imageUrl: text(doc.imageUrl) || null } : null,
    welcomeScreen: typeof stored?.url === 'string' && stored.url ? { url: stored.url, generatedAt: text(stored.generatedAt) } : null,
  };
}
