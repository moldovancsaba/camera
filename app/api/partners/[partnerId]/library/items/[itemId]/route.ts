/**
 * A partner's own upload (camera#361). Only an item uploaded for this partner. Partner managers and global admins.
 *
 * DELETE `?kind=frames`: refused (409) while one of its events has it assigned, so no event is left with a picture that is gone.
 * PATCH `{ kind, name?, messageArea? }` (camera#366): rename it, or say where a message is written on it (null removes the message area). The events whose messages
 *   are written on this frame are redrawn afterwards.
 */

import { NextRequest } from 'next/server';
import { afterResponse } from '@/lib/api/after-response';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError, apiNotFound } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { regenerateEventsUsingFrame } from '@/lib/frame/regenerate';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { deleteLibraryUpload, itemView, updateLibraryUpload } from '@/lib/library/db';

export const DELETE = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { partnerId, itemId } = await context.params;
  const kind = parseKind(request.nextUrl.searchParams.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames or logos');
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await deleteLibraryUpload(db, kind, itemId, { scope: 'partner', partnerId: String(partner.partnerId) });
  if (!result.ok) throw result.status === 404 ? apiNotFound(kind === 'frames' ? 'Frame' : 'Logo') : apiError(result.reason, result.status);
  return apiSuccess({ deleted: itemId });
});

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string; itemId: string }> }) => {
  const session = await requireAuth();
  const { partnerId, itemId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.kind);
  if (!body || !kind) throw apiBadRequest('kind must be frames or logos');
  if (body.name === undefined && body.messageArea === undefined) throw apiBadRequest('Nothing to change: send name or messageArea');
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await updateLibraryUpload(db, kind, itemId, { scope: 'partner', partnerId: String(partner.partnerId) }, { name: body.name, messageArea: body.messageArea }, generateTimestamp());
  if (!result.ok) throw result.status === 404 ? apiNotFound(kind === 'frames' ? 'Frame' : 'Logo') : apiError(result.reason, result.status);
  if (body.messageArea !== undefined) afterResponse(() => regenerateEventsUsingFrame(db, itemId).then((done) => { if (done.failed.length) console.error('Frame images could not be redrawn', done.failed); }));
  return apiSuccess({ item: itemView(kind, result.item) });
});
