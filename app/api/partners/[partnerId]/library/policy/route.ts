/** Change a partner's inherited asset visibility without editing source assets. */
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { apiBadRequest, apiError, apiSuccess, checkRateLimit, RATE_LIMITS, requireAuth, withErrorHandler } from '@/lib/api';
import { generateTimestamp } from '@/lib/db/schemas';
import { assertPartnerMongoWorkspaceAccess } from '@/lib/partners/authorization';
import { parseKind } from '@/lib/library/kinds';
import { enablePartnerAssetInheritance, loadPartnerLibrary, updatePartnerAssetPolicy, type PartnerAssetPolicyAction } from '@/lib/library/db';

const ACTIONS: readonly PartnerAssetPolicyAction[] = ['hide', 'show', 'stop-forwarding', 'allow-forwarding'];

export const PATCH = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = parseKind(body?.kind);
  if (!body || !kind || typeof body.id !== 'string' || body.id.length < 1 || body.id.length > 100 || !ACTIONS.includes(body.action as PartnerAssetPolicyAction)) {
    throw apiBadRequest('Send { kind, id, action }; action must be hide, show, stop-forwarding or allow-forwarding.');
  }
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const changed = await updatePartnerAssetPolicy(db, partner, kind, body.id, body.action as PartnerAssetPolicyAction, generateTimestamp());
  if (!changed.ok) throw apiError(changed.reason, changed.status);
  const saved = await db.collection('partners').findOne({ partnerId: String(partner.partnerId) });
  return apiSuccess({ policy: changed.policy, library: await loadPartnerLibrary(db, saved ?? partner, kind) });
});

export const POST = withErrorHandler(async (request: NextRequest, context: { params: Promise<{ partnerId: string }> }) => {
  const session = await requireAuth(request);
  await checkRateLimit(request, RATE_LIMITS.ADMIN);
  const { partnerId } = await context.params;
  const db = await connectToDatabase();
  const { partner } = await assertPartnerMongoWorkspaceAccess(db, session, partnerId, 'manager');
  const policy = await enablePartnerAssetInheritance(db, partner, generateTimestamp());
  const saved = await db.collection('partners').findOne({ partnerId: String(partner.partnerId) });
  return apiSuccess({ policy, library: await loadPartnerLibrary(db, saved ?? partner, 'images') });
});
