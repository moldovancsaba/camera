/**
 * The global QR texts (issue 326, lib/library/qr-texts.ts): the short lines next to the QR code on the stage of an event's default slideshow. A random active one in the event's language is picked,
 * once, when the event's default slideshow is made. Global admins.
 *
 * GET:  every QR text, switched off ones too, newest first.
 * POST: `{ text, language }` adds one (a line of at most 40 characters, `en` or `hu`); the same text in the same language twice is refused (409).
 * A text is switched off or on, and deleted, with `PATCH` and `DELETE /api/qr-texts/<qrTextId>`.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAdmin, apiSuccess, apiCreated, apiError } from '@/lib/api';
import { createQrText, listQrTexts } from '@/lib/library/qr-texts';

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  return apiSuccess({ items: await listQrTexts(db) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const body = await request.json().catch(() => null);
  const db = await connectToDatabase();
  const result = await createQrText(db, body, session.user.id, generateTimestamp());
  if (!result.ok) throw apiError(result.reason, result.status);
  return apiCreated({ item: result.value });
});
