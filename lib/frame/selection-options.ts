/**
 * What the selection setting of an event (lib/frame/selection.ts) can choose between, read from the event and the frame library: the layouts, the messages and the
 * situation (A, B or C). Server side. Used by the admin route that saves the setting, so a pick is checked against the same lists the editor shows.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { FrameDesign } from './context';
import { parseMessageArea } from './message-area';
import { loadMessageFrames } from './message-frames';
import {
  layoutOptionsOf,
  messageOptionsOf,
  situationOf,
  storedFrameSelection,
  todaysSelection,
  type FrameSelection,
  type LayoutOption,
  type LayoutSituation,
  type MessageOption,
} from './selection';

export interface SelectionContext {
  layouts: LayoutOption[];
  messages: MessageOption[];
  situation: LayoutSituation;
  /** What was saved, or null when the event never set it (it then does what it always did). */
  selection: FrameSelection | null;
  /** What the event does while nothing is saved, written as a setting. */
  today: FrameSelection;
}

/** The complete frames of the event's own that users can pick: assigned and switched on for the event, switched on in the library, with a picture and no message area. */
async function ownFramesOf(db: Db, event: Document): Promise<LayoutOption[]> {
  const assigned = ((event.frames as Document[] | undefined) ?? []).filter((row) => row?.isActive === true && typeof row.frameId === 'string').map((row) => row.frameId as string);
  if (assigned.length === 0) return [];
  const docs = await db.collection(COLLECTIONS.FRAMES).find({ frameId: { $in: [...new Set(assigned)] } }).toArray();
  const byId = new Map(docs.map((doc) => [String(doc.frameId), doc]));
  return [...new Set(assigned)].flatMap((frameId) => {
    const doc = byId.get(frameId);
    if (!doc || doc.isActive === false || typeof doc.imageUrl !== 'string' || !doc.imageUrl || parseMessageArea(doc.messageArea)) return [];
    return [{ id: frameId, name: typeof doc.name === 'string' && doc.name ? doc.name : frameId }];
  });
}

export async function loadSelectionContext(db: Db, event: Document): Promise<SelectionContext> {
  const design = (event.frameDesign as FrameDesign | undefined) ?? null;
  const ownFrames = await ownFramesOf(db, event);
  const carriers = [...(await loadMessageFrames(db, event)).values()].map((frame) => ({ id: frame.frameId, name: frame.name }));
  const layouts = layoutOptionsOf({ ownFrames, carriers, design });
  return {
    layouts,
    messages: ownFrames.length > 0 ? [] : messageOptionsOf(design),
    situation: situationOf(layouts),
    selection: storedFrameSelection(event.frameSelection),
    today: todaysSelection(ownFrames.length),
  };
}
