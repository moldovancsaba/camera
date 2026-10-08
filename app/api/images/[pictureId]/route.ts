/**
 * One image of the global Images library (camera#368, docs/LIBRARIES.md)
 *
 * PATCH:  `{ isActive }` switches it off (no longer offered to be newly chosen; the fields that show it keep it) or on.
 * DELETE: deletes it from the library and takes it out of every partner library. The file stays, so a field that shows it keeps showing it.
 * Global images only: an upload of a partner or an event is changed on that partner's or event's Images page. Global admins.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAdmin, apiSuccess, apiBadRequest, apiError } from '@/lib/api';
import { deleteGlobalImage, setGlobalImageActive } from '@/lib/library/images';

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ pictureId: string }> }) => {
  await requireAdmin();
  const { pictureId } = await context.params;
  const body = (await request.json().catch(() => null)) as { isActive?: unknown } | null;
  if (typeof body?.isActive !== 'boolean') throw apiBadRequest('isActive must be true or false');
  const db = await connectToDatabase();
  const result = await setGlobalImageActive(db, pictureId, body.isActive, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  return apiSuccess({ item: result.item });
});

export const DELETE = withErrorHandler(async (_request: NextRequest, context: { params: Promise<{ pictureId: string }> }) => {
  await requireAdmin();
  const { pictureId } = await context.params;
  const db = await connectToDatabase();
  const result = await deleteGlobalImage(db, pictureId);
  if (!result.ok) throw apiError(result.reason, result.status);
  return apiSuccess({ deleted: pictureId, partnersUpdated: result.partnersUpdated });
});
