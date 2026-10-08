/**
 * The partner's logo from messmass as a library item (camera#367, lib/library/messmass-logo.ts)
 *
 * GET:  whether the partner has a logo from messmass, whether it is imported (the item), and why it cannot be when it cannot. Viewer and above.
 * POST: import it: a logo that belongs to this partner (`scope: 'partner'`, `source: 'messmass'`), in its library at once and assigned to nothing.
 *       A second call returns the logo already imported (200); a new import answers 201. Partner managers and global admins.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiSuccess, apiCreated, apiError } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { itemView } from '@/lib/library/db';
import { importMessmassLogo, messmassLogoState } from '@/lib/library/messmass-logo';

export const GET = withErrorHandler(async (_request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'viewer');
  const state = await messmassLogoState(db, partner);
  return apiSuccess({ logoUrl: state.logoUrl, item: state.item ? itemView('logos', state.item) : null, problem: state.problem });
});

export const POST = withErrorHandler(async (_request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await importMessmassLogo(db, partner, { createdBy: session.user.id, now: generateTimestamp() });
  if (!result.ok) throw apiError(result.reason, result.status);
  const body = { item: itemView('logos', result.item), created: result.created };
  return result.created ? apiCreated(body) : apiSuccess(body);
});
