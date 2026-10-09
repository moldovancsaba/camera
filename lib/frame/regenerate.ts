/**
 * Redraws the frame images of the events whose messages are written on a library frame, after that frame changed (camera#366): its message area was edited,
 * so the stored images no longer match it. An image is reused while everything that decides it is unchanged (variants.ts), so this draws only the messages
 * of that frame. Failures are reported per event and never stop the others. Server side.
 */

import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { FrameDesign } from './context';
import { frameIdsOf } from './selection';
import { generateFrameVariants } from './variants';

/** The events whose messages chose this frame. */
export async function eventsUsingFrame(db: Db, frameId: string): Promise<Document[]> {
  const candidates = await db.collection(COLLECTIONS.EVENTS).find({ 'frameDesign.messageFrames': { $exists: true } }).toArray();
  return candidates.filter((event) => frameIdsOf((event.frameDesign as FrameDesign | undefined)?.messageFrames).includes(frameId));
}

export interface RegenerateResult {
  events: number;
  failed: Array<{ eventId: string; error: string }>;
}

export async function regenerateEventsUsingFrame(db: Db, frameId: string, generate: typeof generateFrameVariants = generateFrameVariants): Promise<RegenerateResult> {
  const events = await eventsUsingFrame(db, frameId);
  const failed: RegenerateResult['failed'] = [];
  for (const event of events) {
    try {
      await generate(db, event);
    } catch (error) {
      failed.push({ eventId: String(event.eventId ?? event._id), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { events: events.length, failed };
}
