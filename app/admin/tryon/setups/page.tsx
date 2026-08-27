import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type TryOnSetup } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import TryOnSetupsInventoryList, { type SerializedTryOnSetupRow } from '@/components/admin/TryOnSetupsInventoryList';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

// WHAT: The AI Setups CRUD's list page. WHY: the audit found tryon_setups
// had zero admin UI -- operators were told to edit MongoDB directly to
// create a processing preset variant. This replaces that with list/create/
// edit/duplicate/archive, mirroring the garments (tryon/suits) list.
export default async function AdminTryOnSetupsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  let setupRows: SerializedTryOnSetupRow[] = [];
  let matchingCount = 0;
  let activeCount = 0;
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';

  try {
    const db = await connectToDatabase();
    const query: Record<string, unknown> = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { setupId: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const [setups, total, active] = await Promise.all([
      db
        .collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS)
        .find(query)
        .sort({ isDefault: -1, rank: 1, setupId: 1 })
        .toArray(),
      db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).countDocuments(query),
      db.collection<TryOnSetup>(COLLECTIONS.TRYON_SETUPS).countDocuments({ ...query, active: true }),
    ]);
    matchingCount = total;
    activeCount = active;

    setupRows = setups.map((setup) => ({
      id: setup._id?.toString?.() ?? setup.setupId,
      setupId: setup.setupId,
      name: setup.name,
      description: setup.description ?? null,
      cameraId: setup.cameraId ?? null,
      isActive: Boolean(setup.active),
      isDefault: Boolean(setup.isDefault),
      profile: setup.config?.processing_profile ?? setup.config?.processingProfile ?? null,
      category: setup.config?.category ?? null,
      defaultForGarmentTypes: Array.isArray(setup.defaultForGarmentTypes) ? setup.defaultForGarmentTypes : null,
    }));
  } catch (error) {
    console.error('Error fetching try-on setups:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="AI Setups"
      description="Try-on processing presets. Global admin only."
      primaryAction={{ href: '/admin/tryon/setups/new', label: 'Create Setup', iconKey: 'plus' }}
      stats={
        !dbError
          ? [
              { label: search ? 'Matching Setups' : 'Setups', value: matchingCount, iconKey: 'photo' },
              { label: 'Active Setups', value: activeCount, iconKey: 'photoScan' },
            ]
          : undefined
      }
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Search setup name, description, or id',
        clearHref: '/admin/tryon/setups',
      }}
      dbError={dbError}
    >
      <TryOnSetupsInventoryList setups={setupRows} />
    </AdminListPageShell>
  );
}
