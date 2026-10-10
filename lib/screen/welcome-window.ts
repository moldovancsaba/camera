/**
 * What fills the photo window of the welcome page screen (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md; owner answers 255 to 260): the event's **sample selfie** by default, or the drawn
 * **stand-in** when the editor chose to keep it. The sample selfie is one of what the event uses (`lib/slots/selfie-store.ts`: its own, its partner's, the global ones), **picked once and
 * stored** on the event (`Event.welcomeWindow.pick`) so the picture does not change on every redraw; it is picked again when it is no longer among them, when its picture cannot be fetched,
 * or when the editor asks (**Pick another**). A picture the registry knows is gone is never tried (`lib/media/pictures.ts`), and one that fails to load is skipped for the next, never an
 * error: with none left the stand-in is drawn. The sample selfie is drawn with the event's frame over it. Dependencies are injected so it is unit-tested without a network.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import { brokenAddresses } from '@/lib/media/pictures';
import { resolveEventSelfieDocs } from '@/lib/slots/selfie-store';
import { pickSelfie } from '@/lib/slots/selfie';
import { eligiblePhoto } from './welcome-photo';

export type WindowSource = 'selfie' | 'photo' | 'standin';
export const WINDOW_SOURCES: readonly WindowSource[] = ['selfie', 'photo', 'standin'];

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** What the event's editor chose for the window: the sample selfie unless the stand-in or a photo of the event was chosen. */
export function windowSourceOf(event: Document | null | undefined): WindowSource {
  const source = (event?.welcomeWindow as { source?: unknown } | undefined)?.source;
  return source === 'standin' || source === 'photo' ? source : 'selfie';
}

/** What a request may set: `source` is a known one (`photo` comes with the `photoId` of a submission), `again` a true or false; nothing else. */
export function parseWindowRequest(input: unknown): { ok: true; value: { source?: WindowSource; photoId?: string; again?: boolean } } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'A body with source and/or again is required.' };
  const { source, photoId, again, ...rest } = input as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return { ok: false, reason: `Unknown field: ${Object.keys(rest)[0]}.` };
  if (source !== undefined && !WINDOW_SOURCES.includes(source as WindowSource)) return { ok: false, reason: `source must be one of: ${WINDOW_SOURCES.join(', ')}.` };
  if (again !== undefined && typeof again !== 'boolean') return { ok: false, reason: 'again must be true or false.' };
  if (source === 'photo' && !(typeof photoId === 'string' && ObjectId.isValid(photoId))) return { ok: false, reason: 'source photo needs the photoId of a photo of the event.' };
  if (photoId !== undefined && source !== 'photo') return { ok: false, reason: 'photoId goes with source photo.' };
  return { ok: true, value: { ...(source !== undefined ? { source: source as WindowSource } : {}), ...(photoId !== undefined ? { photoId: photoId as string } : {}), ...(again !== undefined ? { again } : {}) } };
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
  /** `selfie` (a sample selfie, drawn with the event's frame over it) or `photo` (a photo of the event). */
  kind: 'selfie' | 'photo';
  /** True when the picture already has the event's frame: it is drawn as it is. */
  framed?: boolean;
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
  const usable = docs.map((doc): WindowCandidate => ({ id: text(doc.pictureId), url: text(doc.imageUrl), kind: 'selfie' })).filter((item) => item.id && item.url && !gone.has(item.url));
  const stored = text((event.welcomeWindow as { pick?: { pictureId?: unknown } } | undefined)?.pick?.pictureId);
  const picked = pickSelfie(usable.map((item) => ({ id: item.id, level: 'event' })), stored, options);
  const selfies = picked ? [usable.find((item) => item.id === picked)!, ...usable.filter((item) => item.id !== picked)] : [];
  // A photo of the event, when it can still be shown (the one visibility rule), comes first; when it cannot (hidden, rejected, gone, deleted) or cannot be fetched, the sample selfies follow it,
  // and with none the stand-in: never an error.
  if (source === 'photo') {
    const photo = await eligiblePhoto(db, event, text((event.welcomeWindow as { photoId?: unknown } | undefined)?.photoId));
    if (photo && !gone.has(photo.picture.url)) {
      const candidate: WindowCandidate = { id: photo.id, url: photo.picture.url, kind: 'photo', framed: photo.picture.framed };
      return { source, candidates: [candidate, ...selfies], keyPart: `photo:${photo.id}:${photo.picture.url}:${photo.picture.framed ? 'framed' : 'clean'}` };
    }
  }
  return { source: source === 'photo' ? 'selfie' : source, candidates: selfies, keyPart: selfies.length > 0 ? `selfie:${selfies[0].id}:${selfies[0].url}` : 'standin' };
}

export interface WindowChoice {
  /** What fills the window, or null for the stand-in. */
  picture: Buffer | null;
  /** The sample selfie that was fetched (and is stored as the pick), or null; a photo of the event is never a pick. */
  pickedId: string | null;
  /** True when the event's frame is drawn over the picture: a sample selfie or a clean photo, not a photo that already has the frame (and not the stand-in's choice, which keeps the frame as before). */
  drawFrame: boolean;
  /** The part of the key that matches what was really drawn (the first candidate that could be fetched). */
  keyPart: string;
}

/** Fetches the first candidate that can be fetched; the ones before it are skipped, never an error; with none the stand-in is drawn. */
export async function fetchWindow(plan: WindowPlan, deps: Pick<WindowDeps, 'fetchImage'>): Promise<WindowChoice> {
  for (const candidate of plan.candidates) {
    const picture = await deps.fetchImage(candidate.url);
    if (!picture) continue;
    return candidate.kind === 'photo'
      ? { picture, pickedId: null, drawFrame: candidate.framed !== true, keyPart: plan.keyPart }
      : { picture, pickedId: candidate.id, drawFrame: true, keyPart: `selfie:${candidate.id}:${candidate.url}` };
  }
  return { picture: null, pickedId: null, drawFrame: true, keyPart: 'standin' };
}

/** Stores the pick on the event when it changed (a pick that is already stored writes nothing). */
export async function storePick(db: Db, event: Document, pickedId: string | null, now: string): Promise<void> {
  const stored = text((event.welcomeWindow as { pick?: { pictureId?: unknown } } | undefined)?.pick?.pictureId);
  if (!pickedId || pickedId === stored) return;
  await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: text(event.eventId) }, { $set: { 'welcomeWindow.pick': { pictureId: pickedId, pickedAt: now } } });
}

export interface WindowState {
  source: WindowSource;
  /** The photo of the event chosen for the window and whether it can still be shown (when it cannot, the sample selfie is drawn instead). */
  photo: { id: string; imageUrl: string; kind: 'clean' | 'framed'; usable: boolean } | null;
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
  const photoId = text((event.welcomeWindow as { photoId?: unknown } | undefined)?.photoId);
  const photo = photoId ? await eligiblePhoto(db, event, photoId) : null;
  const chosenPhoto = windowSourceOf(event) === 'photo' && photoId ? (photo ? { id: photoId, imageUrl: photo.picture.url, kind: photo.picture.framed ? ('framed' as const) : ('clean' as const), usable: true } : { id: photoId, imageUrl: '', kind: 'framed' as const, usable: false }) : null;
  return {
    source: windowSourceOf(event),
    photo: chosenPhoto,
    pick: doc && doc.isActive !== false ? { id: pickedId, name: text(doc.name) || pickedId, imageUrl: text(doc.imageUrl) || null } : null,
    welcomeScreen: typeof stored?.url === 'string' && stored.url ? { url: stored.url, generatedAt: text(stored.generatedAt) } : null,
  };
}
