import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import PhotoVettingRolloutConsole from '@/components/admin/PhotoVettingRolloutConsole';

export const dynamic = 'force-dynamic';

// WHAT: The rollout of photo vetting to the events that already exist (camera#271).
// WHY: The owner decided every event requires vetting; the report shows who will be affected before the real run.
export default async function PhotoVettingRolloutPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  return (
    <AdminListPageShell
      eyebrow="Operations"
      title="Photo vetting"
      description="Turn photo vetting on for every event: new photos wait for approval, and the guest gets the link by email after it. Dry run first. Global admin only."
      primaryAction={{ href: '/admin/events', label: 'Events' }}
      dbError={null}
    >
      <PhotoVettingRolloutConsole />
    </AdminListPageShell>
  );
}
