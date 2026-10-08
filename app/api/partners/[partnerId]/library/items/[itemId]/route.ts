/**
 * Delete a partner's own upload (camera#361): DELETE `?kind=frames`. Only an item uploaded for this partner; refused (409) while one of its events
 * has it assigned, so no event is left with a picture that is gone. Partner managers and global admins.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiSuccess, apiBadRequest, apiError, apiNotFound } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { deleteLibraryUpload } from '@/lib/library/db';

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
