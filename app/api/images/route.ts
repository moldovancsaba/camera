/**
 * Global Images library API (camera#368, docs/LIBRARIES.md)
 *
 * GET:  the global library, newest first: the images collected for every partner to take. `?scope=all` lists every upload, partners' and events'
 *       own too, each with whose upload it is. Global admins.
 * POST: upload an image into the global library. Multipart: `file` (PNG, JPEG, WebP or SVG, up to 4 MB), `name`, `description?`. Global admins.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAdmin, apiSuccess, apiBadRequest, apiCreated } from '@/lib/api';
import { itemView } from '@/lib/library/db';
import { listGlobalImages } from '@/lib/library/images';
import { createLibraryItem } from '@/lib/library/upload';

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAdmin();
  const all = request.nextUrl.searchParams.get('scope') === 'all';
  const db = await connectToDatabase();
  return apiSuccess({ items: await listGlobalImages(db, { all }) });
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
  });
  if (!result.ok) throw apiBadRequest(result.reason);
  return apiCreated({ item: itemView('images', result.item) });
});
