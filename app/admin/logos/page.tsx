/**
 * Logos Admin Page
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/gds/AdminListPageShell';
import LogosInventoryList, { type SerializedLogoRow } from '@/components/gds/LogosInventoryList';
import { mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

interface Logo {
  _id?: unknown;
  logoId: string;
  name: string;
  description?: string;
  imageUrl: string;
  isActive: boolean;
  usageCount?: number;
}

interface PartnerLogoUsage {
  _id?: unknown;
  partnerId: string;
  name: string;
  defaultLogos?: Array<{ logoId: string }>;
}

interface EventLogoUsage {
  _id?: unknown;
  eventId: string;
  name: string;
  logos?: Array<{ logoId: string }>;
}

export default async function LogosPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let logoRows: SerializedLogoRow[] = [];
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { logoId: { $regex: search, $options: 'i' } },
          ],
        }
      : {};
    const logos = (await db
      .collection(COLLECTIONS.LOGOS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()) as unknown as Logo[];

    const partnerUsageByLogoId = new Map<string, PartnerLogoUsage[]>();
    const eventUsageByLogoId = new Map<string, EventLogoUsage[]>();

    const partners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find({ defaultLogos: { $exists: true, $ne: [] } })
      .toArray()) as unknown as PartnerLogoUsage[];
    for (const partner of partners) {
      for (const logo of partner.defaultLogos || []) {
        const bucket = partnerUsageByLogoId.get(logo.logoId) || [];
        bucket.push(partner);
        partnerUsageByLogoId.set(logo.logoId, bucket);
      }
    }

    const events = (await db
      .collection(COLLECTIONS.EVENTS)
      .find({ logos: { $exists: true, $ne: [] } })
      .toArray()) as unknown as EventLogoUsage[];
    for (const event of events) {
      for (const logo of event.logos || []) {
        const bucket = eventUsageByLogoId.get(logo.logoId) || [];
        bucket.push(event);
        eventUsageByLogoId.set(logo.logoId, bucket);
      }
    }

    logoRows = [];
    for (const logo of logos) {
      const id = mongoIdString(logo._id);
      if (!id) continue;
      const partnerAssignments = partnerUsageByLogoId.get(logo.logoId) || [];
      const eventAssignments = eventUsageByLogoId.get(logo.logoId) || [];
      const primaryPartner = partnerAssignments[0];
      const primaryEvent = eventAssignments[0];
      logoRows.push({
        id,
        logoId: logo.logoId,
        name: logo.name,
        description: logo.description ?? null,
        imageUrl: logo.imageUrl,
        isActive: Boolean(logo.isActive),
        usageCount: logo.usageCount || 0,
        partnerDefaultCount: partnerAssignments.length,
        eventAssignmentCount: eventAssignments.length,
        primaryPartnerAdminId: mongoIdString(primaryPartner?._id),
        primaryPartnerName: primaryPartner?.name ?? null,
        primaryEventAdminId: mongoIdString(primaryEvent?._id),
        primaryEventName: primaryEvent?.name ?? null,
      });
    }
  } catch (error) {
    console.error('Error fetching logos:', error);
    dbError = serializeMongoError(error);
  }

  const partnerDefaultTotal = logoRows.reduce((sum, logo) => sum + logo.partnerDefaultCount, 0);
  const eventAssignmentTotal = logoRows.reduce((sum, logo) => sum + logo.eventAssignmentCount, 0);

  return (
    <AdminListPageShell
      eyebrow="Resource Inventory"
      title="Global Logos"
      description="Shared logo inventory across partners, event scenarios, and app experiences."
      primaryAction={{ href: '/admin/logos/new', label: 'Upload Shared Logo', iconKey: 'plus' }}
      stats={
        !dbError
          ? [
              { label: 'Visible Logos', value: logoRows.length, iconKey: 'photo' },
              { label: 'Partner Defaults', value: partnerDefaultTotal, iconKey: 'users' },
              { label: 'Event Assignments', value: eventAssignmentTotal, iconKey: 'photo' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search logo name, description, or logo ID',
        clearHref: '/admin/logos',
      }}
      dbError={dbError}
    >
      <LogosInventoryList logos={logoRows} />
    </AdminListPageShell>
  );
}
