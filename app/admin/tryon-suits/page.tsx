import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type Event, type LeatherSuit, type TryOnJob } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import TryOnSuitsInventoryList, { type SerializedTryOnSuitRow } from '@/components/gds/TryOnSuitsInventoryList';
import { mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { getLeatherSuitPreviewUrl } from '@/lib/tryon/suits';

export const dynamic = 'force-dynamic';

export default async function AdminTryOnSuitsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  let suitRows: SerializedTryOnSuitRow[] = [];
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
            { leatherSuitId: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const suits = await db
      .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const events = (await db
      .collection<Event>(COLLECTIONS.EVENTS)
      .find({ 'tryOn.allowedLeatherSuitIds.0': { $exists: true } }, { projection: { tryOn: 1 } })
      .toArray()) as Event[];

    const jobs = (await db
      .collection<TryOnJob>(COLLECTIONS.TRYON_JOBS)
      .aggregate<{ _id: string; count: number }>([
        { $group: { _id: '$request.leatherSuitId', count: { $sum: 1 } } },
      ])
      .toArray());

    const eventAssignmentCountBySuit = new Map<string, number>();
    for (const event of events) {
      for (const suitId of event.tryOn?.allowedLeatherSuitIds || []) {
        eventAssignmentCountBySuit.set(suitId, (eventAssignmentCountBySuit.get(suitId) || 0) + 1);
      }
    }

    const queueUsageBySuit = new Map(jobs.map((job) => [job._id, job.count]));

    suitRows = suits.flatMap((suit) => {
      const id = mongoIdString(suit._id);
      const imageUrl = suit.imageUrl || suit.sourceImageUrl || suit.previewUrl;
      if (!id || !imageUrl) return [];

      return [
        {
          id,
          leatherSuitId: suit.leatherSuitId,
          name: suit.name,
          description: suit.description ?? suit.metadata?.notes ?? null,
          imageUrl,
          thumbnailUrl: suit.thumbnailUrl ?? getLeatherSuitPreviewUrl(suit),
          isActive: Boolean(suit.active),
          eventAssignmentCount: eventAssignmentCountBySuit.get(suit.leatherSuitId) || 0,
          queueUsageCount: queueUsageBySuit.get(suit.leatherSuitId) || 0,
        },
      ];
    });
  } catch (error) {
    console.error('Error fetching try-on leather jerseys:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Garments"
      primaryAction={{ href: '/admin/tryon/suits/new', label: 'Upload Leather Jersey', iconKey: 'plus' }}
      stats={
        !dbError
          ? [
              { label: 'Catalog Entries', value: suitRows.length, iconKey: 'photo' },
              { label: 'Active Entries', value: suitRows.filter((row) => row.isActive).length, iconKey: 'photoScan' },
              { label: 'Event Allowlists', value: suitRows.reduce((sum, row) => sum + row.eventAssignmentCount, 0), iconKey: 'users' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search leather jersey name, description, or catalog ID',
        clearHref: '/admin/tryon/suits',
      }}
      dbError={dbError}
    >
      <TryOnSuitsInventoryList suits={suitRows} />
    </AdminListPageShell>
  );
}
