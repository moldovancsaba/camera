/**
 * Admin Partners Listing
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession, listAccessiblePartnerIds } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import PartnersInventoryList, { type SerializedPartnerRow } from '@/components/gds/PartnersInventoryList';
import { formatAdminDate, mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

interface PartnerListItem {
  _id?: unknown;
  partnerId?: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: unknown;
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  let partnerRows: SerializedPartnerRow[] = [];
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const accessiblePartnerIds = await listAccessiblePartnerIds(db, session, undefined);
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { partnerId: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    if (!isGlobalAdminSession(session)) {
      Object.assign(query, { partnerId: { $in: accessiblePartnerIds } });
    }

    const partners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()) as unknown as PartnerListItem[];

    partnerRows = [];
    for (const partner of partners) {
      const id = mongoIdString(partner._id);
      const partnerId = partner.partnerId || '';
      if (!id || !partnerId) continue;

      const eventCount = await db.collection(COLLECTIONS.EVENTS).countDocuments({ partnerId });
      const frameCount = await db.collection(COLLECTIONS.FRAMES).countDocuments({ partnerId });
      const userAccessCount = await db
        .collection(COLLECTIONS.PARTNER_USER_ACCESS)
        .countDocuments({ partnerId, isActive: true });

      partnerRows.push({
        id,
        partnerId,
        name: partner.name || 'Untitled partner',
        description: partner.description ?? null,
        eventCount,
        frameCount,
        userAccessCount,
        createdAtLabel: formatAdminDate(partner.createdAt),
        isActive: Boolean(partner.isActive),
      });
    }
  } catch (error) {
    console.error('Error fetching partners:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Camera Core"
      title="Partners"
      description="Manage partner organizations, access, and app ownership from one inventory view."
      primaryAction={{ href: '/admin/partners/new', label: 'Add Partner', iconKey: 'plus' }}
      stats={
        !dbError
          ? [
              { label: 'Visible Partners', value: partnerRows.length, iconKey: 'buildingStore' },
              {
                label: 'Partner Users',
                value: partnerRows.reduce((sum, partner) => sum + partner.userAccessCount, 0),
                iconKey: 'users',
              },
              {
                label: 'Partner Frames',
                value: partnerRows.reduce((sum, partner) => sum + partner.frameCount, 0),
                iconKey: 'frame',
              },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search partners',
        placeholder: 'Name, description, or partner ID',
        clearHref: '/admin/partners',
      }}
      dbError={dbError}
    >
      <PartnersInventoryList partners={partnerRows} />
    </AdminListPageShell>
  );
}
