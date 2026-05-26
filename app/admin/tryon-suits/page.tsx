import { redirect } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS, type LeatherSuit } from '@/lib/db/schemas';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/gds/AdminListPageShell';
import TryOnSuitCatalogManager, { type TryOnSuitAdminRow } from '@/components/admin/TryOnSuitCatalogManager';

export const dynamic = 'force-dynamic';

export default async function AdminTryOnSuitsPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const db = await connectToDatabase();
  const suits = await db
    .collection<LeatherSuit>(COLLECTIONS.LEATHER_SUITS)
    .find({})
    .sort({ active: -1, name: 1 })
    .toArray();

  const rows: TryOnSuitAdminRow[] = suits.map((suit) => ({
    leatherSuitId: suit.leatherSuitId,
    name: suit.name,
    category: suit.category,
    assetKey: suit.assetKey,
    assetVersion: suit.assetVersion,
    assetRelativePath: suit.assetRelativePath ?? null,
    previewUrl: suit.previewUrl ?? null,
    sourceImageUrl: suit.sourceImageUrl ?? null,
    active: suit.active,
    metadata: {
      notes: suit.metadata?.notes ?? null,
    },
  }));

  return (
    <AdminListPageShell
      eyebrow="Resource Inventory"
      title="Leather Jerseys"
      description="Manage the try-on leather catalog that events can expose to users. These records map Camera to the local try-on asset registry."
      primaryAction={{ href: '/admin/tryon-suits', label: 'Refresh Catalog' }}
      stats={[
        { label: 'Catalog Entries', value: rows.length, iconKey: 'photo' },
        { label: 'Active Entries', value: rows.filter((row) => row.active).length, iconKey: 'photoScan' },
      ]}
    >
      <TryOnSuitCatalogManager initialRows={rows} />
    </AdminListPageShell>
  );
}
