import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import TryOnMaintenanceConsole from '@/components/admin/TryOnMaintenanceConsole';

export const dynamic = 'force-dynamic';

// WHAT: A Maintenance page under Operations wiring the previously
// zero-caller /api/admin/tryon-worker-health endpoint, plus the two
// read-only/dry-run-first backfill scripts (audit-tryon-data-integrity.ts,
// reconcile-tryon-done-jobs.ts) as real UI actions. WHY: the roadmap's own
// scope explicitly excludes the other ~9 one-time backfill/migration
// scripts -- those stay CLI-only; this covers the two that are ongoing
// maintenance operations, not one-time migrations.
export default async function AdminTryOnMaintenancePage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Maintenance"
      description="Worker health, data integrity checks, and job reconciliation. Global admin only."
      primaryAction={{ href: '/admin/tryon', label: 'Open Try-On App' }}
      dbError={null}
    >
      <TryOnMaintenanceConsole />
    </AdminListPageShell>
  );
}
