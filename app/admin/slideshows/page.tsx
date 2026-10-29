import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import SlideshowsInventoryList, {
  type SerializedSlideshowRow,
} from '@/components/gds/SlideshowsInventoryList';
import { formatAdminDate, mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

interface SlideshowInventoryItem {
  _id?: unknown;
  slideshowId: string;
  eventId: string;
  eventMongoId?: unknown;
  eventName: string;
  name: string;
  isActive: boolean;
  transitionDurationMs?: number;
  fadeDurationMs?: number;
  bufferSize?: number;
  refreshStrategy?: 'continuous' | 'batch';
  playMode?: 'once' | 'loop';
  orderMode?: 'fixed' | 'random';
  createdAt: string;
  updatedAt: string;
}

interface EventLookup {
  eventId: string;
  partnerName?: string;
  _id?: unknown;
}

export default async function SlideshowsInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  let slideshowRows: SerializedSlideshowRow[] = [];
  let dbError = null;

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } },
        { slideshowId: { $regex: search, $options: 'i' } },
      ];
    }

    const slideshows = (await db
      .collection(COLLECTIONS.SLIDESHOWS)
      .find(query, {
        projection: {
          _id: 1,
          slideshowId: 1,
          eventId: 1,
          eventMongoId: 1,
          eventName: 1,
          name: 1,
          isActive: 1,
          transitionDurationMs: 1,
          fadeDurationMs: 1,
          bufferSize: 1,
          refreshStrategy: 1,
          playMode: 1,
          orderMode: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(200)
      .toArray()) as unknown as SlideshowInventoryItem[];

    const eventIds = [...new Set(slideshows.map((slideshow) => slideshow.eventId).filter(Boolean))];
    const eventLookup = new Map<string, EventLookup>();

    if (eventIds.length > 0) {
      const events = (await db.collection(COLLECTIONS.EVENTS).find(
        { eventId: { $in: eventIds } },
        {
          projection: {
            _id: 1,
            eventId: 1,
            partnerName: 1,
          },
        }
      ).toArray()) as unknown as EventLookup[];

      for (const event of events) {
        eventLookup.set(event.eventId, event);
      }
    }

    const rows: SerializedSlideshowRow[] = [];

    for (const slideshow of slideshows) {
      const id = mongoIdString(slideshow._id);
      if (!id) continue;

      const ownerEvent = eventLookup.get(slideshow.eventId);
      const eventMongoId = mongoIdString(slideshow.eventMongoId) || mongoIdString(ownerEvent?._id) || '';

      rows.push({
        id,
        slideshowId: slideshow.slideshowId,
        eventId: slideshow.eventId,
        eventMongoId,
        eventName: slideshow.eventName,
        partnerName: ownerEvent?.partnerName ?? null,
        name: slideshow.name,
        isActive: Boolean(slideshow.isActive),
        transitionDurationMs: slideshow.transitionDurationMs ?? 5000,
        fadeDurationMs: slideshow.fadeDurationMs ?? 1000,
        bufferSize: slideshow.bufferSize ?? 10,
        refreshStrategy: slideshow.refreshStrategy ?? 'continuous',
        playMode: slideshow.playMode ?? 'loop',
        orderMode: slideshow.orderMode ?? 'fixed',
        updatedAtLabel: formatAdminDate(slideshow.updatedAt || slideshow.createdAt),
      });
    }

    slideshowRows = rows;
  } catch (error) {
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Resource Inventory"
      title="Slideshows"
      description="Manage event slideshow definitions, open the public player, or jump back to the owning event."
      status={!dbError ? `${slideshowRows.length} found` : undefined}
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search slideshow name, event name, or public ID',
        clearHref: '/admin/slideshows',
      }}
      toolbarHint="Use the global slideshow inventory to find and edit event players."
      dbError={dbError}
    >
      <SlideshowsInventoryList slideshows={slideshowRows} />
    </AdminListPageShell>
  );
}
