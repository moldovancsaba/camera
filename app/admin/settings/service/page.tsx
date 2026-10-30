import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import ServiceTools from '@/components/admin/ServiceTools';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';

export const dynamic = 'force-dynamic';

/** Global-only home for maintenance operations and one-time backfills. */
export default async function ServicePage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) redirect('/admin');

  return (
    <AdminListPageShell
      eyebrow="Settings"
      title="Service"
      description="Maintenance tools, health checks, and controlled backfills. These operations can affect many events or stored images; review each dry run and confirmation before running it."
      dbError={null}
    >
      <ServiceTools />
    </AdminListPageShell>
  );
}
