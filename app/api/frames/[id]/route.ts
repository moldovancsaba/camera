/**
 * Frame API - Individual Frame Operations
 * 
 * GET: Get single frame by ID
 * PUT: Update frame
 * DELETE: Delete frame (global admin only)
 */

import { NextRequest } from 'next/server';
import { afterResponse } from '@/lib/api/after-response';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { type Frame } from '@/lib/db/schemas';
import { parseMessageArea } from '@/lib/frame/message-area';
import { regenerateEventsUsingFrame } from '@/lib/frame/regenerate';
import { inUseSentence, usageOfItem } from '@/lib/library/db';
import {
  requireAdmin,
  withErrorHandler,
  apiSuccess,
  apiError,
  apiNotFound,
  apiBadRequest,
} from '@/lib/api';

/**
 * GET /api/frames/[id]
 * Get a single frame by ID
 */
export const GET = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireAdmin();
  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid frame ID');
  }

  const db = await connectToDatabase();
  const frame = await db.collection<Frame>('frames').findOne({ _id: new ObjectId(id) });

  if (!frame) {
    throw apiNotFound('Frame');
  }

  return apiSuccess({ frame });
});

/**
 * PUT /api/frames/[id]
 * Update a frame (global admin only)
 */
export const PUT = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await requireAdmin();

  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid frame ID');
  }

  const body = await request.json();
  const { name, description, category, isActive, messageArea } = body;

  const db = await connectToDatabase();
  
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  const unsetData: Record<string, ''> = {};

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (category !== undefined) updateData.category = category;
  if (isActive !== undefined) updateData.isActive = isActive;
  // Where a message is written on the frame (camera#366): null removes it; anything else must be usable.
  if (messageArea === null) unsetData.messageArea = '';
  else if (messageArea !== undefined) {
    const area = parseMessageArea(messageArea);
    if (!area) throw apiBadRequest('The message area is not usable: the box must sit inside the 1920 x 1080 frame and the colour must be a hex colour.');
    updateData.messageArea = area;
  }

  const result = await db.collection<Frame>('frames').findOneAndUpdate(
    { _id: new ObjectId(id) },
    Object.keys(unsetData).length ? { $set: updateData, $unset: unsetData } : { $set: updateData },
    { returnDocument: 'after', projection: { frameId: 1 } }
  );

  if (!result) {
    throw apiNotFound('Frame');
  }

  // The events whose messages are written on this frame are redrawn (an image is reused while nothing that decides it changed).
  if (messageArea !== undefined && result.frameId) {
    const frameId = result.frameId;
    afterResponse(() => regenerateEventsUsingFrame(db, frameId).then((done) => { if (done.failed.length) console.error('Frame images could not be redrawn', done.failed); }));
  }

  return apiSuccess({ success: true });
});

/**
 * DELETE /api/frames/[id]
 * Delete a frame (global admin only)
 */
export const DELETE = withErrorHandler(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await requireAdmin();

  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid frame ID');
  }

  const db = await connectToDatabase();
  const frame = await db.collection<Frame>('frames').findOne({ _id: new ObjectId(id) });
  if (!frame) {
    throw apiNotFound('Frame');
  }

  // A frame that an event or a partner library uses is not deleted (camera#392): the events would show a picture that is gone. Switch it off instead.
  const refusal = inUseSentence('frame', await usageOfItem(db, 'frames', String(frame.frameId)));
  if (refusal) {
    throw apiError(refusal, 409);
  }

  const result = await db.collection<Frame>('frames').deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) {
    throw apiNotFound('Frame');
  }

  return apiSuccess({ success: true });
});
