import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type LeatherSuit, generateTimestamp } from '@/lib/db/schemas';
import {
  apiBadRequest,
  apiNotFound,
  apiSuccess,
  requireAdmin,
  withErrorHandler,
} from '@/lib/api';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ leatherSuitId: string }> }
) => {
  await requireAdmin();
  const { leatherSuitId } = await context.params;
  const normalizedId = normalizeString(leatherSuitId);
  if (!normalizedId) {
    throw apiBadRequest('Leather suit id is required');
  }

  const body = await request.json();
  const updateFields: Partial<LeatherSuit> & { updatedAt: string } = {
    updatedAt: generateTimestamp(),
  };

  if (body.name !== undefined) updateFields.name = normalizeString(body.name);
  if (body.assetKey !== undefined) updateFields.assetKey = normalizeString(body.assetKey);
  if (body.assetRelativePath !== undefined) updateFields.assetRelativePath = normalizeString(body.assetRelativePath) || null;
  if (body.previewUrl !== undefined) updateFields.previewUrl = normalizeString(body.previewUrl) || null;
  if (body.sourceImageUrl !== undefined) updateFields.sourceImageUrl = normalizeString(body.sourceImageUrl) || null;
  if (body.active !== undefined) updateFields.active = Boolean(body.active);
  if (body.assetVersion !== undefined) {
    const parsed = Number(body.assetVersion);
    updateFields.assetVersion = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
  }
  if (body.notes !== undefined) {
    updateFields.metadata = {
      pose: 'front_a_pose',
      notes: normalizeString(body.notes) || null,
    };
  }

  const db = await connectToDatabase();
  const result = await db.collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS).findOneAndUpdate(
    { leatherSuitId: normalizedId },
    { $set: updateFields },
    { returnDocument: 'after' }
  );

  if (!result) {
    throw apiNotFound('Leather suit');
  }

  return apiSuccess({ suit: result });
});
