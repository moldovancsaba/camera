/**
 * Upload a sample selfie for a partner (issue 540): a library image with the sample selfie tag that belongs to the partner (`scope: 'partner'`) and joins what the partner chose at once.
 * Multipart: `file`, `name`, `description?`. Partner managers and global admins.
 */

import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { generateTimestamp } from '@/lib/db/schemas';
import { withErrorHandler, requireAuth, apiBadRequest, apiCreated } from '@/lib/api';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { itemView } from '@/lib/library/db';
import { SAMPLE_SELFIE_TAG } from '@/lib/library/sample-selfie';
import { createLibraryItem } from '@/lib/library/upload';
import { addSelfieToPartnerSlot } from '@/lib/slots/selfie-store';
import { scheduleWelcomeRedrawForPartner } from '@/lib/screen/welcome-redraw';

export const POST = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth();
  const { partnerId } = await context.params;
  const form = await request.formData();
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const result = await createLibraryItem(db, {
    kind: 'images',
    file: form.get('file'),
    name: form.get('name'),
    description: form.get('description') ?? undefined,
    createdBy: session.user.id,
    owner: { scope: 'partner', partnerId: String(partner.partnerId) },
    tags: [SAMPLE_SELFIE_TAG],
  });
  if (!result.ok) throw apiBadRequest(result.reason);
  const added = await addSelfieToPartnerSlot(db, partner, String(result.item.pictureId), generateTimestamp());
  if (!added.ok) throw apiBadRequest(added.reason);
  // The new selfie joins what the partner uses: the welcome page screens of its events that have the picture are drawn again after the response where the pick changes (lib/screen/welcome-redraw.ts).
  scheduleWelcomeRedrawForPartner(String(partner.partnerId), 'partner-sample-selfie');
  return apiCreated({ item: itemView('images', result.item) });
});
