/**
 * The global Images library (camera#368, docs/LIBRARIES.md): the list the global admins collect, and what they do with a global picture (switch it off
 * or on, delete it). A partner's or an event's own upload is changed on that partner's or that event's Images page, never here. Every function takes the
 * database as an argument, so tests pass a fake one.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { GLOBAL_FILTER, itemView } from './db';
import { withoutSampleSelfies } from './sample-selfie';
import type { GlobalImageEntry, LibraryItemView } from './types';

/** The most images one list returns, as for the other libraries. */
const LIST_LIMIT = 500;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const images = (db: Db) => db.collection(COLLECTIONS.IMAGES);

async function namesById(db: Db, collection: string, idField: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const docs = await db.collection(collection).find({ [idField]: { $in: ids } }, { projection: { [idField]: 1, name: 1 } }).toArray();
  return new Map(docs.map((doc) => [text(doc[idField]), text(doc.name)]));
}

/** The global images, newest first; with `all`, every image, each with the partner or the event it was uploaded for. */
export async function listGlobalImages(db: Db, options: { all: boolean }): Promise<GlobalImageEntry[]> {
  const docs = await images(db).find({ ...(options.all ? {} : GLOBAL_FILTER), ...withoutSampleSelfies('images') }).sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray();
  const views = docs.map((doc) => ({ doc, view: itemView('images', doc) }));
  const partnerIds = [...new Set(views.filter(({ view }) => view.scope === 'partner').map(({ doc }) => text(doc.partnerId)).filter(Boolean))];
  const eventIds = [...new Set(views.filter(({ view }) => view.scope === 'event').map(({ doc }) => text(doc.eventId)).filter(Boolean))];
  const [partners, events] = await Promise.all([
    namesById(db, COLLECTIONS.PARTNERS, 'partnerId', partnerIds),
    namesById(db, COLLECTIONS.EVENTS, 'eventId', eventIds),
  ]);
  return views.map(({ doc, view }) => ({
    ...view,
    owner:
      view.scope === 'partner'
        ? { level: 'partner' as const, name: partners.get(text(doc.partnerId)) || 'a partner' }
        : view.scope === 'event'
          ? { level: 'event' as const, name: events.get(text(doc.eventId)) || 'an event' }
          : null,
  }));
}

export type GlobalImageChange = { ok: true; item: LibraryItemView } | { ok: false; status: 400 | 404; reason: string };

/** The image, if it is a global one; a partner's or an event's upload is refused with where to change it. */
async function globalImage(db: Db, pictureId: string): Promise<{ ok: true; doc: Document } | { ok: false; status: 400 | 404; reason: string }> {
  const doc = await images(db).findOne({ pictureId });
  if (!doc) return { ok: false, status: 404, reason: 'Image not found' };
  const { scope } = itemView('images', doc);
  if (scope !== 'global') return { ok: false, status: 400, reason: `This image was uploaded for ${scope === 'partner' ? 'a partner' : 'one event'}: change it on the Images page of that ${scope}.` };
  return { ok: true, doc };
}

/** Switches a global image off (it is no longer offered to be newly chosen; the fields that show it keep it) or on. */
export async function setGlobalImageActive(db: Db, pictureId: string, isActive: boolean, now: string): Promise<GlobalImageChange> {
  const found = await globalImage(db, pictureId);
  if (!found.ok) return found;
  await images(db).updateOne({ pictureId }, { $set: { isActive, updatedAt: now } });
  return { ok: true, item: itemView('images', { ...found.doc, isActive, updatedAt: now }) };
}

/**
 * Deletes a global image and takes it out of every partner library that holds it. The file stays in the store, so a picture field that shows
 * it keeps its address and the picture keeps showing; only the library forgets it.
 */
export async function deleteGlobalImage(db: Db, pictureId: string): Promise<{ ok: true; partnersUpdated: number } | { ok: false; status: 400 | 404; reason: string }> {
  const found = await globalImage(db, pictureId);
  if (!found.ok) return found;
  const pulled = await db.collection(COLLECTIONS.PARTNERS).updateMany({ 'library.images': pictureId }, { $pull: { 'library.images': pictureId } as Document });
  await images(db).deleteOne({ pictureId });
  return { ok: true, partnersUpdated: pulled.modifiedCount };
}
