/** Source-owner control for the Global→Partner or Partner→Event sharing boundary. */
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { parseKind, KIND_META } from '@/lib/library/kinds';
import { fieldsOf } from '@/lib/library/db';
import { scopeOf } from '@/lib/library/rules';
import { isGlobalAdminSession, assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ kind: string; assetId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { kind: rawKind, assetId } = await context.params;
  const kind = parseKind(rawKind);
  if (!kind || assetId.length < 1 || assetId.length > 100) throw apiBadRequest('A supported asset kind and id are required.');
  const body = (await request.json().catch(() => null)) as { shareToChildren?: unknown } | null;
  if (!body || typeof body.shareToChildren !== 'boolean') throw apiBadRequest('Send { shareToChildren: boolean }.');
  const db = await connectToDatabase();
  const item = await db.collection(KIND_META[kind].collection).findOne({ [KIND_META[kind].idField]: assetId });
  if (!item) throw apiNotFound(KIND_META[kind].noun);
  const scope = scopeOf(fieldsOf(item));
  if (scope === 'event') throw apiBadRequest('Event assets have no child level to share with.');
  if (scope === 'global') {
    if (!isGlobalAdminSession(session)) throw apiForbidden('Global admin access is required to change a global asset.');
  } else if (scope === 'partner') {
    const access = await assertPartnerMongoWorkspaceAccess(db, session, String(item.partnerId ?? ''), 'manager');
    if (!access.partner) throw apiForbidden('Partner manager access is required.');
  }
  await db.collection(KIND_META[kind].collection).updateOne(
    { [KIND_META[kind].idField]: assetId },
    { $set: { shareToChildren: body.shareToChildren, updatedAt: generateTimestamp() } },
  );
  return apiSuccess({ kind, id: assetId, shareToChildren: body.shareToChildren, scope });
});
