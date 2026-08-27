/**
 * Frame API - Individual Frame Operations
 * 
 * GET: Get single frame by ID
 * PUT: Update frame
 * DELETE: Delete frame (global admin only)
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import { type Frame } from '@/lib/db/schemas';
import {
  requireAdmin,
  withErrorHandler,
  apiSuccess,
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
  const { name, description, category, isActive } = body;

  const db = await connectToDatabase();
  
  const updateData: Record<string, string | boolean> = {
    updatedAt: new Date().toISOString(),
  };

  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (category !== undefined) updateData.category = category;
  if (isActive !== undefined) updateData.isActive = isActive;

  const result = await db.collection<Frame>('frames').updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    throw apiNotFound('Frame');
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
  const result = await db.collection<Frame>('frames').deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    throw apiNotFound('Frame');
  }

  return apiSuccess({ success: true });
});
