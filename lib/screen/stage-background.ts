/**
 * Which stadium background the stage of an event's default slideshow is drawn on (issue 326, plan items 1, 9, 10 and 49): the event's own choice wins, else its partner's, else a random active one
 * of the global library (`lib/slots/stadium-store.ts`). **The pick is made once, when the stage is drawn, and stored on the event** (`Event.stageBackground`), so an event looks the same every
 * time; an editor picks another or chooses its own. With no stadium background in the library (the library starts empty), or none that can be fetched, there is **no pick and the built-in stage is
 * drawn**, exactly the picture every event had before the library existed (`renderStageOverlay` with `null`): a picture that cannot be fetched is skipped for the next, never an error, and a
 * picture the registry knows is gone is never tried (lib/media/pictures.ts). Dependencies are injected so it is unit-tested without a network.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { fetchLogo } from '@/lib/frame/logo';
import { brokenAddresses } from '@/lib/media/pictures';
import { resolveEventStadiumDocs } from '@/lib/slots/stadium-store';
import { pickStadium } from '@/lib/slots/stadium';

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export interface StageBackground {
  pictureId: string;
  name: string;
  picture: Buffer;
}

export interface StageBackgroundDeps {
  /** An https image of an allowed host, or null (lib/frame/logo.ts). */
  fetchImage: (url: string) => Promise<Buffer | null>;
  random?: () => number;
}

export const defaultStageBackgroundDeps: StageBackgroundDeps = { fetchImage: (url) => fetchLogo(url) };

/** The stadium background the event has stored as its pick, or null. */
export function storedStagePick(event: Document | null | undefined): string {
  return text((event?.stageBackground as { pictureId?: unknown } | undefined)?.pictureId);
}

/**
 * The stadium background to draw the stage on: the stored pick while it is still among what the event uses, else a random one (`again` asks for another one that is not the stored pick). The
 * pictures are tried in that order and the first that can be fetched wins; null when there is none, which means the built-in stage. Nothing is stored here.
 */
export async function chooseStageBackground(db: Db, event: Document, deps: StageBackgroundDeps = defaultStageBackgroundDeps, options: { again?: boolean } = {}): Promise<StageBackground | null> {
  const [docs, gone] = await Promise.all([resolveEventStadiumDocs(db, event), brokenAddresses(db)]);
  const usable = docs.map((doc) => ({ id: text(doc.pictureId), url: text(doc.imageUrl), name: text(doc.name) })).filter((item) => item.id && item.url && !gone.has(item.url));
  const picked = pickStadium(usable.map((item) => ({ id: item.id, level: 'event' })), storedStagePick(event), { again: options.again, random: deps.random });
  if (!picked) return null;
  const ordered = [usable.find((item) => item.id === picked)!, ...usable.filter((item) => item.id !== picked)];
  for (const item of ordered) {
    const picture = await deps.fetchImage(item.url);
    if (picture) return { pictureId: item.id, name: item.name || item.id, picture };
  }
  return null;
}

/** Stores the pick on the event when it changed (a pick that is already stored writes nothing); with no pick (the built-in stage) it removes a stored one only when `clear` says so. */
export async function storeStagePick(db: Db, event: Document, pictureId: string | null, now: string, options: { clear?: boolean } = {}): Promise<void> {
  const eventId = text(event.eventId);
  if (!eventId) return;
  if (pictureId) {
    if (pictureId === storedStagePick(event)) return;
    await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId }, { $set: { stageBackground: { pictureId, pickedAt: now } } });
  } else if (options.clear && storedStagePick(event)) {
    await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId }, { $unset: { stageBackground: '' } });
  }
}

/** True when the overlay picture of a slideshow is the one the system drew for this event (`screens/<event uuid>/default-<hash>.png`), not a picture an editor chose: only then may the stage be drawn again. */
export function isGeneratedOverlay(overlayImageUrl: unknown, eventUuid: string): boolean {
  const url = text(overlayImageUrl);
  if (!url || !eventUuid) return false;
  try {
    return new URL(url).pathname.includes(`/screens/${eventUuid}/default-`);
  } catch {
    return false;
  }
}
