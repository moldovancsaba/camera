/**
 * The global stadium backgrounds (issue 326, docs/SCREEN_DESIGN.md): the pictures the stage of an event's default slideshow is drawn on, with the event's colours over them, for every event that has nothing of its own.
 *
 * GET:  every global stadium background, switched off ones too, newest first. Global admins.
 * POST: upload one. Multipart: `file` (PNG, JPEG, WebP or SVG, up to 4 MB), `name`, `description?`. Only images cleared for commercial use are uploaded (owner answer 256: no tick). Global admins.
 * A stadium background is switched off or on and deleted with `PATCH` and `DELETE /api/images/<pictureId>`, like any global image.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAdmin, apiSuccess, apiBadRequest, apiCreated } from '@/lib/api';
import { itemView } from '@/lib/library/db';
import { STADIUM_BACKGROUND_TAG } from '@/lib/library/stadium-background';
import { createLibraryItem } from '@/lib/library/upload';
import { listStadiumBackgrounds } from '@/lib/slots/stadium-store';

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  return apiSuccess({ items: await listStadiumBackgrounds(db) });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAdmin();
  const form = await request.formData();
  const db = await connectToDatabase();
  const result = await createLibraryItem(db, {
    kind: 'images',
    file: form.get('file'),
    name: form.get('name'),
    description: form.get('description') ?? undefined,
    createdBy: session.user.id,
    owner: { scope: 'global' },
    tags: [STADIUM_BACKGROUND_TAG],
  });
  if (!result.ok) throw apiBadRequest(result.reason);
  return apiCreated({ item: itemView('images', result.item) });
});
