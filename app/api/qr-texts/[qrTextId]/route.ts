/**
 * One QR text of the library (issue 326, lib/library/qr-texts.ts). Global admins.
 *
 * PATCH:  `{ isActive }` switches it off (it is no longer picked for a new event; an event that has it keeps it, it is a text of its slideshow) or on.
 * DELETE: deletes it from the library; the slideshows that have it keep it.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAdmin, apiSuccess, apiBadRequest, apiError } from '@/lib/api';
import { deleteQrText, setQrTextActive } from '@/lib/library/qr-texts';

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ qrTextId: string }> }) => {
  await requireAdmin();
  const { qrTextId } = await context.params;
  const body = (await request.json().catch(() => null)) as { isActive?: unknown } | null;
  if (typeof body?.isActive !== 'boolean') throw apiBadRequest('isActive must be true or false');
  const db = await connectToDatabase();
  const result = await setQrTextActive(db, qrTextId, body.isActive, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  return apiSuccess({ item: result.value });
});

export const DELETE = withErrorHandler(async (_request: NextRequest, context: { params: Promise<{ qrTextId: string }> }) => {
  await requireAdmin();
  const { qrTextId } = await context.params;
  const db = await connectToDatabase();
  const result = await deleteQrText(db, qrTextId);
  if (!result.ok) throw apiError(result.reason, result.status);
  return apiSuccess(result.value);
});
