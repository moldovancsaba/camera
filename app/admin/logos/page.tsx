/**
 * Logos Admin Page: the global library of logos. `?scope=all` also lists what partners and events have for themselves (their uploads and the
 * partner logos imported from messmass), which no other partner can take (camera#361, camera#367).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { GLOBAL_FILTER } from '@/lib/library/db';
import { scopeOf } from '@/lib/library/rules';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
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
  scope?: 'global' | 'partner' | 'event' | null;
  partnerId?: string | null;
  eventId?: string | null;
  source?: string | null;
}

interface OwnerRef {
  _id?: unknown;
  partnerId?: string;
  eventId?: string;
  name: string;
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
  searchParams?: Promise<{ search?: string; scope?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let logoRows: SerializedLogoRow[] = [];
  let matchingLogoCount = 0;
  let partnerDefaultTotal = 0;
  let eventAssignmentTotal = 0;
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const showAll = resolvedSearchParams?.scope === 'all';

  try {
    const db = await connectToDatabase();
    const searchFilter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { logoId: { $regex: search, $options: 'i' } },
          ],
        }
      : null;
    // The global library by default; `?scope=all` also lists the logos partners and events have for themselves.
    const query = showAll ? (searchFilter ?? {}) : searchFilter ? { $and: [GLOBAL_FILTER, searchFilter] } : GLOBAL_FILTER;
    const [logos, totalLogos, matchingLogoIds] = await Promise.all([
      db
        .collection(COLLECTIONS.LOGOS)
        .find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray() as Promise<unknown[]>,
      db.collection(COLLECTIONS.LOGOS).countDocuments(query),
      db.collection(COLLECTIONS.LOGOS).distinct('logoId', query),
    ]);
    matchingLogoCount = totalLogos;
    const logoIds = matchingLogoIds.filter((logoId): logoId is string => typeof logoId === 'string' && logoId.trim().length > 0);

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
    if (logoIds.length > 0) {
      const [partnerDefaults, eventAssignments] = await Promise.all([
        db
          .collection(COLLECTIONS.PARTNERS)
          .aggregate<{ total: number }>([
            { $unwind: '$defaultLogos' },
            { $match: { 'defaultLogos.logoId': { $in: logoIds } } },
            { $count: 'total' },
          ])
          .toArray(),
        db
          .collection(COLLECTIONS.EVENTS)
          .aggregate<{ total: number }>([
            { $unwind: '$logos' },
            { $match: { 'logos.logoId': { $in: logoIds } } },
            { $count: 'total' },
          ])
          .toArray(),
      ]);
      partnerDefaultTotal = partnerDefaults[0]?.total ?? 0;
      eventAssignmentTotal = eventAssignments[0]?.total ?? 0;
    }

    // Who owns a logo that is not global: its partner, or its event.
    const ownLogos = (logos as Logo[]).filter((logo) => scopeOf(logo) !== 'global');
    const ownerPartnerIds = [...new Set(ownLogos.map((logo) => logo.partnerId).filter((value): value is string => typeof value === 'string' && value.length > 0))];
    const ownerEventIds = [...new Set(ownLogos.map((logo) => logo.eventId).filter((value): value is string => typeof value === 'string' && value.length > 0))];
    const [ownerPartners, ownerEvents] = await Promise.all([
      ownerPartnerIds.length ? (db.collection(COLLECTIONS.PARTNERS).find({ partnerId: { $in: ownerPartnerIds } }, { projection: { partnerId: 1, name: 1 } }).toArray() as unknown as Promise<OwnerRef[]>) : Promise.resolve([] as OwnerRef[]),
      ownerEventIds.length ? (db.collection(COLLECTIONS.EVENTS).find({ eventId: { $in: ownerEventIds } }, { projection: { eventId: 1, name: 1 } }).toArray() as unknown as Promise<OwnerRef[]>) : Promise.resolve([] as OwnerRef[]),
    ]);
    const partnerByUuid = new Map(ownerPartners.map((partner) => [partner.partnerId, partner]));
    const eventByUuid = new Map(ownerEvents.map((event) => [event.eventId, event]));

    logoRows = [];
    for (const logo of logos as Logo[]) {
      const id = mongoIdString(logo._id);
      if (!id) continue;
      const partnerAssignments = partnerUsageByLogoId.get(logo.logoId) || [];
      const eventAssignments = eventUsageByLogoId.get(logo.logoId) || [];
      const primaryPartner = partnerAssignments[0];
      const primaryEvent = eventAssignments[0];
      const scope = scopeOf(logo);
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
        scope,
        source: logo.source ?? null,
        ownerName: scope === 'partner' ? (partnerByUuid.get(logo.partnerId ?? '')?.name ?? null) : scope === 'event' ? (eventByUuid.get(logo.eventId ?? '')?.name ?? null) : null,
      });
    }
  } catch (error) {
    console.error('Error fetching logos:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Resource Inventory"
      title="Global Logos"
      description={showAll ? 'Every logo, including the ones partners and events have for themselves.' : 'The global library: logos collected for every partner to take into its own library.'}
      primaryAction={{ href: '/admin/logos/new', label: 'Upload Shared Logo', iconKey: 'plus' }}
      stats={
        !dbError
          ? [
              { label: search ? 'Matching Logos' : 'Logos', value: matchingLogoCount, iconKey: 'photo' },
              { label: 'Partner Defaults', value: partnerDefaultTotal, iconKey: 'users' },
              { label: 'Event Assignments', value: eventAssignmentTotal, iconKey: 'photo' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search logo name, description, or logo ID',
        clearHref: showAll ? '/admin/logos?scope=all' : '/admin/logos',
        hiddenFields: showAll ? { scope: 'all' } : undefined,
      }}
      toolbarTrailing={{ href: showAll ? '/admin/logos' : '/admin/logos?scope=all', label: showAll ? 'Show the global library only' : 'Show every logo (partners and events too)' }}
      dbError={dbError}
    >
      <LogosInventoryList logos={logoRows} />
    </AdminListPageShell>
  );
}
