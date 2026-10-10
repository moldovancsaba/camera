/**
 * The global sample selfies (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the pictures that fill the photo window of the welcome page screen for every event that has nothing of its own.
 *
 * GET:  every global sample selfie, switched off ones too, newest first. Global admins.
 * POST: upload one. Multipart: `file` (PNG, JPEG, WebP or SVG, up to 4 MB), `name`, `description?`. Only images cleared for commercial use are uploaded (owner answer 256: no tick). Global admins.
 * A sample selfie is switched off or on and deleted with `PATCH` and `DELETE /api/images/<pictureId>`, like any global image.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAdmin, apiSuccess, apiBadRequest, apiCreated } from '@/lib/api';
import { itemView } from '@/lib/library/db';
import { SAMPLE_SELFIE_TAG } from '@/lib/library/sample-selfie';
import { createLibraryItem } from '@/lib/library/upload';
import { listSampleSelfies } from '@/lib/slots/selfie-store';

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const db = await connectToDatabase();
  return apiSuccess({ items: await listSampleSelfies(db) });
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
    tags: [SAMPLE_SELFIE_TAG],
  });
  if (!result.ok) throw apiBadRequest(result.reason);
  return apiCreated({ item: itemView('images', result.item) });
});
