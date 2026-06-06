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
  let matchingPartnerCount = 0;
  let partnerUsersCount = 0;
  let partnerFramesCount = 0;
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

    const matchingPartners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find(query, { projection: { partnerId: 1 } })
      .toArray()) as unknown as Array<{ partnerId?: string }>;
    const matchingPartnerIds = matchingPartners
      .map((partner) => partner.partnerId)
      .filter((partnerId): partnerId is string => typeof partnerId === 'string' && partnerId.trim().length > 0);

    const [partners, userTotal, frameTotal] = await Promise.all([
      db
        .collection(COLLECTIONS.PARTNERS)
        .find(query)
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray() as Promise<unknown[]>,
      matchingPartnerIds.length > 0
        ? db.collection(COLLECTIONS.PARTNER_USER_ACCESS).countDocuments({
            partnerId: { $in: matchingPartnerIds },
            isActive: true,
          })
        : Promise.resolve(0),
      matchingPartnerIds.length > 0
        ? db.collection(COLLECTIONS.FRAMES).countDocuments({ partnerId: { $in: matchingPartnerIds } })
        : Promise.resolve(0),
    ]);
    matchingPartnerCount = matchingPartnerIds.length;
    partnerUsersCount = userTotal;
    partnerFramesCount = frameTotal;

    partnerRows = [];
    for (const partner of partners as PartnerListItem[]) {
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
      primaryAction={{ href: '/admin/partners/new', label: 'Add Partner', iconKey: 'plus' }}
      stats={
        !dbError
          ? [
              { label: search ? 'Matching Partners' : 'Partners', value: matchingPartnerCount, iconKey: 'buildingStore' },
              {
                label: 'Partner Users',
                value: partnerUsersCount,
                iconKey: 'users',
              },
              {
                label: 'Partner Frames',
                value: partnerFramesCount,
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
