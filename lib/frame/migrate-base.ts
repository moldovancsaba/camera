/**
 * Moves the designers' base picture of an event into the library (camera#369): `frameDesign.base` is data on the event, in no list; the model of the libraries wants
 * the pictures to be frames of the event, listed in its Assigned frames, with each message choosing its frame. This creates one event-level frame for each picture of
 * the base (with the same message area), assigns them, and makes each message choose the frame it uses today, so the guests get the same pictures. The base is kept
 * until `retireBase` says it is no longer needed, so the step can be undone. Server side; unit-tested with a fake database.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS, generateId } from '@/lib/db/schemas';
import { parseFrameBase } from './base';
import type { FrameDesign } from './context';
import type { MessageArea } from './message-area';
import { frameIdsOf, framesOfMessage } from './selection';

export interface MigrationSummary {
  /** The frames of the event that came from the base picture, in the order of the pictures. */
  frames: Array<{ frameId: string; key: string; created: boolean }>;
  /** Which frame each message now chooses. */
  messageFrames: Record<string, string>;
}

export type MigrationResult = ({ ok: true } & MigrationSummary) | { ok: false; status: 400; reason: string };

/**
 * Creates the event's frames from the pictures of its base (reusing a frame that already has the same picture), assigns them, and sets the frame of every message.
 * A message uses the picture the base gives it (`messageImages`, else the first picture), as the drawing does today. Safe to repeat.
 */
export async function migrateBaseToLibrary(db: Db, event: Document, by: string, now: string): Promise<MigrationResult> {
  const design = event.frameDesign as FrameDesign | undefined;
  const base = parseFrameBase(design?.base);
  if (!base || !design) return { ok: false, status: 400, reason: "This event has no designers' base picture to move into the library." };
  const eventId = String(event.eventId ?? '');
  if (!eventId) return { ok: false, status: 400, reason: 'The event has no id.' };

  const area: MessageArea = { messageBox: base.messageBox, ...(base.messageColor ? { messageColor: base.messageColor } : {}), ...(base.layers ? { layers: base.layers } : {}) };
  const frames = db.collection(COLLECTIONS.FRAMES);
  const summary: MigrationSummary['frames'] = [];
  const assigned = new Set(((event.frames as Document[] | undefined) ?? []).map((row) => String(row?.frameId)));
  const newRows: Document[] = [];
  for (const image of base.images) {
    const existing = await frames.findOne({ scope: 'event', eventId, imageUrl: image.imageUrl });
    let frameId: string;
    if (existing) {
      frameId = String(existing.frameId);
      // The message area follows the base, so the frame looks exactly like the picture it came from.
      await frames.updateOne({ frameId }, { $set: { messageArea: area, updatedAt: now } });
      summary.push({ frameId, key: image.key, created: false });
    } else {
      frameId = generateId();
      await frames.insertOne({
        frameId,
        name: `${String(event.name ?? 'Event')}: ${image.key}`,
        description: "The designers' picture of the event, moved into the library from the event's own data.",
        category: 'general',
        imageUrl: image.imageUrl,
        deleteUrl: '',
        imageId: '',
        fileSize: null,
        mimeType: 'image/png',
        isActive: true,
        createdBy: by,
        createdAt: now,
        updatedAt: now,
        scope: 'event',
        eventId,
        ...(typeof event.partnerId === 'string' && event.partnerId ? { partnerId: event.partnerId } : {}),
        messageArea: area,
      });
      summary.push({ frameId, key: image.key, created: true });
    }
    if (!assigned.has(frameId)) {
      newRows.push({ frameId, isActive: true, addedAt: now, addedBy: by });
      assigned.add(frameId);
    }
  }

  const frameOfKey = new Map(summary.map((row) => [row.key, row.frameId]));
  const messageFrames: Record<string, string> = {};
  for (const message of design.messages) {
    const key = base.messageImages?.[message] ?? base.images[0].key;
    const frameId = frameOfKey.get(key);
    if (frameId) messageFrames[message] = frameId;
  }

  const set: Document = { 'frameDesign.messageFrames': messageFrames, framesOverridden: true, updatedAt: now };
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, newRows.length ? { $set: set, $push: { frames: { $each: newRows } } as Document } : { $set: set });
  return { ok: true, frames: summary, messageFrames };
}

export type RetireResult = { ok: true } | { ok: false; status: 400; reason: string };

/**
 * Removes the old base picture data once every message chooses a frame that exists, so nothing the guests see depends on it. Refuses while a message would lose its
 * picture.
 */
export async function retireBase(db: Db, event: Document, now: string): Promise<RetireResult> {
  const design = event.frameDesign as FrameDesign | undefined;
  if (!design?.base) return { ok: false, status: 400, reason: 'This event has no base picture data to remove.' };
  const choices = design.messageFrames ?? {};
  const missing = design.messages.filter((message) => framesOfMessage(choices, message).length === 0);
  if (missing.length > 0) return { ok: false, status: 400, reason: `Every message must choose a frame first. Without one: ${missing.map((m) => `"${m}"`).join(', ')}.` };
  const ids = frameIdsOf(choices);
  const found = await db.collection(COLLECTIONS.FRAMES).find({ frameId: { $in: ids }, messageArea: { $exists: true }, isActive: { $ne: false } }).toArray();
  const usable = new Set(found.map((frame) => String(frame.frameId)));
  const gone = ids.filter((id) => !usable.has(id));
  if (gone.length > 0) return { ok: false, status: 400, reason: 'A frame a message chose is missing, switched off or has no message area.' };
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, { $unset: { 'frameDesign.base': '' }, $set: { updatedAt: now } });
  return { ok: true };
}
