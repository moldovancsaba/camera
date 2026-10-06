import { cache } from 'react';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

/**
 * The event as the public capture routes read it for metadata, viewport and the manifest.
 * `cache` makes generateMetadata and generateViewport of one request share a single database read.
 */
export const loadCaptureEvent = cache(async (eventId: string) => {
  if (!ObjectId.isValid(eventId)) return null;
  const db = await connectToDatabase();
  return db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventId) });
});
