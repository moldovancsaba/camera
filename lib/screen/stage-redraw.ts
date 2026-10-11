/**
 * The stage of an event's default slideshow drawn again on the stadium background the event uses now (issue 326, plan items 1, 9, 10 and 49). A new event's stage is drawn when its default
 * slideshow is made (lib/slideshow/default-slideshow.ts); an event that exists keeps the stage it has until an editor asks here (the card **Default stage** on the event's Slideshows page): after
 * choosing its own stadium background, picking another, or when the library got one. Nothing runs by itself.
 *
 * **Only a stage the system drew is drawn again** (`isGeneratedOverlay`): a slideshow whose overlay picture an editor chose (the designers' picture of MTK x Vasas, any uploaded overlay) is never
 * touched, and the card says so. The new picture is stored next to the old one (`screens/<event uuid>/default-<hash>.png`; the same stage gives the same address, so asking again with
 * nothing changed writes nothing), the default slideshow's `screenDesign.overlayImageUrl` is pointed at it, and the open screens reload like after any save of the slideshow. A background that cannot
 * be fetched is skipped for the next, with none the built-in stage is drawn: never an error. Dependencies are injected so it is unit-tested without Blob or a network.
 */

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateTimestamp } from '@/lib/db/schemas';
import { findDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { loadEventTheme } from '@/lib/theme/load';
import { resolveEventStadiumDocs } from '@/lib/slots/stadium-store';
import { renderStageOverlay } from './default-stage';
import { chooseStageBackground, defaultStageBackgroundDeps, isGeneratedOverlay, storeStagePick, storedStagePick, type StageBackgroundDeps } from './stage-background';

export interface StageRedrawDeps {
  upload: (pathname: string, png: Buffer) => Promise<string>;
  now: () => string;
  background: StageBackgroundDeps;
}

const defaultDeps: StageRedrawDeps = {
  upload: async (pathname, png) => (await put(pathname, png, { access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 })).url,
  now: generateTimestamp,
  background: defaultStageBackgroundDeps,
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export interface StageState {
  slideshowId: string | null;
  /** The overlay picture of the default slideshow is the one the system drew, so a stadium background applies to it; false when an editor chose another picture (or there is no default slideshow). */
  generated: boolean;
  /** The stadium background the stage is drawn on now (the stored pick), or null: the built-in stage. */
  pick: { id: string; name: string; imageUrl: string | null } | null;
  /** How many stadium backgrounds the event can use now. */
  available: number;
  overlayUrl: string | null;
}

/** What the card shows. */
export async function stageState(db: Db, event: Document): Promise<StageState> {
  const eventUuid = text(event.eventId);
  const slideshow = eventUuid ? await findDefaultSlideshow(db, eventUuid) : null;
  const overlayUrl = text((slideshow?.screenDesign as { overlayImageUrl?: unknown } | undefined)?.overlayImageUrl) || null;
  const pickedId = storedStagePick(event);
  const doc = pickedId ? await db.collection(COLLECTIONS.IMAGES).findOne({ pictureId: pickedId }) : null;
  return {
    slideshowId: slideshow ? text(slideshow.slideshowId) : null,
    generated: slideshow ? isGeneratedOverlay(overlayUrl, eventUuid) : false,
    pick: doc && doc.isActive !== false ? { id: pickedId, name: text(doc.name) || pickedId, imageUrl: text(doc.imageUrl) || null } : null,
    available: (await resolveEventStadiumDocs(db, event)).length,
    overlayUrl,
  };
}

export type StageRedrawResult = { ok: true; changed: boolean; url: string } | { ok: false; reason: string };

/**
 * Draws the stage of the default slideshow again: on the stored pick while it is still among what the event uses, else a random one (`again` for another), else the built-in stage. Returns
 * `changed: false` when the picture is the one the slideshow has already.
 */
export async function redrawStage(db: Db, event: Document, deps: StageRedrawDeps = defaultDeps, options: { again?: boolean } = {}): Promise<StageRedrawResult> {
  const eventUuid = text(event.eventId);
  if (!eventUuid) return { ok: false, reason: 'The event has no id.' };
  const slideshow = await findDefaultSlideshow(db, eventUuid);
  if (!slideshow) return { ok: false, reason: 'The event has no default slideshow.' };
  const current = text((slideshow.screenDesign as { overlayImageUrl?: unknown } | undefined)?.overlayImageUrl);
  if (!isGeneratedOverlay(current, eventUuid)) return { ok: false, reason: 'The default slideshow has a stage picture of its own, so a stadium background does not apply to it.' };

  const theme = await loadEventTheme(db, event);
  const colours = { background: theme.background, accent: theme.buttonBackground };
  const stage = await chooseStageBackground(db, event, deps.background, { again: options.again });
  const png = await renderStageOverlay(colours, stage?.picture ?? null);
  const url = await deps.upload(`screens/${eventUuid}/default-${createHash('sha256').update(png).digest('hex').slice(0, 16)}.png`, png);
  const now = deps.now();
  // The pick is what was really drawn: a stored pick is replaced by the one that was used, and removed when the built-in stage is drawn.
  await storeStagePick(db, event, stage?.pictureId ?? null, now, { clear: true });
  if (url === current) return { ok: true, changed: false, url };
  // The same as any save of the slideshow's design: the new picture, and the open screens reload to show it (the reload token, camera#476).
  await db.collection(COLLECTIONS.SLIDESHOWS).updateOne({ slideshowId: slideshow.slideshowId }, { $set: { 'screenDesign.overlayImageUrl': url, updatedAt: now, reloadRequestedAt: now } });
  return { ok: true, changed: true, url };
}
