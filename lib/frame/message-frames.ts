/**
 * Which library frame each message of an event is written on (camera#366). `frameDesign.messageFrames` maps the text of a message to the id of a frame
 * of the event that has a message area; a message that is not listed keeps the older base picture or the generated layout. Server side (it reads the
 * library); `parseMessageFrames` and `frameBaseOf` are pure and unit-tested.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { FrameBase } from './base';
import type { FrameDesign } from './context';
import { parseMessageArea, type MessageArea } from './message-area';

const MAX_FRAME_ID_LENGTH = 80;

export type ParsedMessageFrames = { ok: true; messageFrames: Record<string, string> } | { ok: false; error: string };

/** The submitted choices, checked against the message list: every key is a message of the list, every value a frame id. Nothing or null means no choices. */
export function parseMessageFrames(input: unknown, messages: readonly string[]): ParsedMessageFrames {
  if (input === undefined || input === null) return { ok: true, messageFrames: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'The frames of the messages must be a list of message and frame' };
  const known = new Set(messages);
  const messageFrames: Record<string, string> = {};
  for (const [message, frameId] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(message)) return { ok: false, error: `There is no message "${message}" in the list` };
    if (frameId === null || frameId === '') continue;
    if (typeof frameId !== 'string' || frameId.length > MAX_FRAME_ID_LENGTH) return { ok: false, error: `The frame of "${message}" must be a frame id` };
    messageFrames[message] = frameId;
  }
  return { ok: true, messageFrames };
}

/** A frame of an event that can carry messages. */
export interface MessageFrame {
  frameId: string;
  name: string;
  imageUrl: string;
  area: MessageArea;
}

/**
 * The frames of the event that can carry a message: assigned to the event and switched on for it, switched on in the library, with a picture and a usable
 * message area. Keyed by frame id.
 */
export async function loadMessageFrames(db: Db, event: Document): Promise<Map<string, MessageFrame>> {
  const assigned = ((event.frames as Document[] | undefined) ?? []).filter((row) => row?.isActive === true && typeof row.frameId === 'string').map((row) => row.frameId as string);
  const found = new Map<string, MessageFrame>();
  if (assigned.length === 0) return found;
  const docs = await db.collection(COLLECTIONS.FRAMES).find({ frameId: { $in: [...new Set(assigned)] } }).toArray();
  for (const doc of docs) {
    const area = parseMessageArea(doc.messageArea);
    if (doc.isActive === false || !area || typeof doc.imageUrl !== 'string' || !doc.imageUrl) continue;
    found.set(String(doc.frameId), { frameId: String(doc.frameId), name: typeof doc.name === 'string' ? doc.name : String(doc.frameId), imageUrl: doc.imageUrl, area });
  }
  return found;
}

/** The choices checked against the frames the event can use: a frame that is not assigned, switched off or without a message area is refused with a plain message. */
export async function validateMessageFrames(db: Db, event: Document, messages: readonly string[], input: unknown): Promise<ParsedMessageFrames> {
  const parsed = parseMessageFrames(input, messages);
  if (!parsed.ok || Object.keys(parsed.messageFrames).length === 0) return parsed;
  const usable = await loadMessageFrames(db, event);
  for (const [message, frameId] of Object.entries(parsed.messageFrames)) {
    if (!usable.has(frameId)) return { ok: false, error: `The frame chosen for "${message}" is not available: it must be assigned to this event, switched on, and have a message area.` };
  }
  return parsed;
}

/** The frame chosen for the message at `index` of the list, or null. */
export function chosenFrameId(design: Pick<FrameDesign, 'messages' | 'messageFrames'>, index: number | null): string | null {
  if (index === null) return null;
  const message = design.messages[index];
  return (message !== undefined ? design.messageFrames?.[message] : undefined) ?? null;
}

/** The same shape the older base picture has, made from one library frame, so the renderer draws it the same way. */
export function frameBaseOf(frame: MessageFrame): FrameBase {
  return {
    images: [{ key: 'frame', imageUrl: frame.imageUrl }],
    messageBox: frame.area.messageBox,
    ...(frame.area.messageColor ? { messageColor: frame.area.messageColor } : {}),
    ...(frame.area.layers ? { layers: frame.area.layers } : {}),
  };
}
