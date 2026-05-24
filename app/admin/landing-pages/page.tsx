import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import LandingPagesPageView, { type SerializedLandingPageRow } from '@/components/gds/LandingPagesPageView';
import { formatAdminDate, mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

interface LandingPageInventoryItem {
  _id?: unknown;
  slug: string;
  title?: string | null;
  eventMongoId: string;
  eventId: string;
  eventName: string;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EventLookup {
  eventId: string;
  partnerName?: string;
}

export default async function LandingPagesInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; partner?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  let landingPageRows: SerializedLandingPageRow[] = [];
  let dbError = null;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const partnerFilter = typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {};

    if (search) {
      query.$or = [
        { slug: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { targetName: { $regex: search, $options: 'i' } },
      ];
    }

    let landingPages = (await db
      .collection(COLLECTIONS.LANDING_PAGES)
      .find(query)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200)
      .toArray()) as unknown as LandingPageInventoryItem[];

    const eventIds = [...new Set(landingPages.map((page) => page.eventId).filter(Boolean))];
    const eventLookup = new Map<string, EventLookup>();
    if (eventIds.length > 0) {
      const events = (await db.collection(COLLECTIONS.EVENTS).find({ eventId: { $in: eventIds } }).toArray()) as unknown as EventLookup[];
      for (const event of events) {
        eventLookup.set(event.eventId, event);
      }
    }

    if (partnerFilter) {
      const lowered = partnerFilter.toLowerCase();
      landingPages = landingPages.filter(
        (page) => (eventLookup.get(page.eventId)?.partnerName || '').toLowerCase() === lowered
      );
    }

    landingPageRows = [];
    for (const page of landingPages) {
      const id = mongoIdString(page._id);
      if (!id) continue;
      const ownerEvent = eventLookup.get(page.eventId);
      landingPageRows.push({
        id,
        slug: page.slug,
        title: page.title ?? null,
        eventMongoId: page.eventMongoId,
        eventName: page.eventName,
        targetType: page.targetType,
        targetName: page.targetName,
        isActive: Boolean(page.isActive),
        updatedAtLabel: formatAdminDate(page.updatedAt || page.createdAt),
        partnerName: ownerEvent?.partnerName ?? null,
      });
    }
  } catch (error) {
    dbError = serializeMongoError(error);
  }

  return (
    <LandingPagesPageView
      landingPages={landingPageRows}
      search={search}
      partnerFilter={partnerFilter}
      dbError={dbError}
    />
  );
}
