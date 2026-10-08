/**
 * Partner library upload (camera#361): POST a file as an item that belongs to this partner (`scope: 'partner'`). It is in the partner's library at
 * once and no other partner can take it. Multipart: `kind`, `file`, `name`, `description?`, `category?`. Partner managers and global admins.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiBadRequest, apiCreated } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { createLibraryItem } from '@/lib/library/upload';
import { itemView } from '@/lib/library/db';

export const POST = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const form = await request.formData();
  const kind = parseKind(form.get('kind'));
  if (!kind) throw apiBadRequest('kind must be frames or logos');

  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await createLibraryItem(db, {
    kind,
    file: form.get('file'),
    name: form.get('name'),
    description: form.get('description') ?? undefined,
    category: form.get('category') ?? undefined,
    createdBy: session.user.id,
    owner: { scope: 'partner', partnerId: String(partner.partnerId) },
  });
  if (!result.ok) throw apiBadRequest(result.reason);
  return apiCreated({ item: itemView(kind, result.item) });
});
