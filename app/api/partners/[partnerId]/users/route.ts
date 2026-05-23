import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type PartnerAccessRole, type PartnerAppKey } from '@/lib/db/schemas';
import { apiBadRequest, apiNotFound, apiSuccess, withErrorHandler, requireAdmin, apiCreated } from '@/lib/api';
import { getPartnerAccessSummary, upsertPartnerUserAccess } from '@/lib/partners/access';

function parseAppKey(value: unknown): PartnerAppKey | null {
  return value === 'events' ? 'events' : null;
}

function parseRole(value: unknown): PartnerAccessRole | null {
  return value === 'viewer' || value === 'manager' || value === 'admin' ? value : null;
}

export const GET = withErrorHandler(async (
  request,
  context: { params: Promise<{ partnerId: string }> }
) => {
  await requireAdmin();
  const { partnerId } = await context.params;
  if (!ObjectId.isValid(partnerId)) {
    throw apiBadRequest('Invalid partner ID.');
  }

  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!partner) {
    throw apiNotFound('Partner');
  }

  const summary = await getPartnerAccessSummary(db, String(partner.partnerId));
  return apiSuccess({
    partner: {
      partnerId: String(partner.partnerId),
      name: String(partner.name),
    },
    ...summary,
  });
});

export const POST = withErrorHandler(async (
  request,
  context: { params: Promise<{ partnerId: string }> }
) => {
  const session = await requireAdmin();
  const { partnerId } = await context.params;
  if (!ObjectId.isValid(partnerId)) {
    throw apiBadRequest('Invalid partner ID.');
  }

  const body = await request.json();
  const appKey = parseAppKey(body.appKey);
  const role = parseRole(body.role);
  const userEmail = String(body.userEmail ?? '').trim().toLowerCase();
  const userName = typeof body.userName === 'string' ? body.userName.trim() : '';
  const isActive = body.isActive !== false;

  if (!userEmail) {
    throw apiBadRequest('userEmail is required.');
  }
  if (!appKey) {
    throw apiBadRequest('appKey must be "events".');
  }
  if (!role) {
    throw apiBadRequest('role must be "viewer", "manager", or "admin".');
  }

  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(partnerId) });
  if (!partner) {
    throw apiNotFound('Partner');
  }

  const assignment = await upsertPartnerUserAccess(db, {
    partnerId: String(partner.partnerId),
    partnerName: String(partner.name),
    userEmail,
    userName,
    appKey,
    role,
    isActive,
    createdBy: session.user.id,
  });

  return apiCreated({
    assignment,
  });
});
