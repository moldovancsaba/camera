import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import FrameBackfillConsole from '@/components/admin/FrameBackfillConsole';

export const dynamic = 'force-dynamic';

// WHAT: The rollout of the generated default frame to the events that already exist (camera#238).
// WHY: Every event without a frame of its own gets one; the owner reviews a dry-run report before the real run.
export default async function GeneratedFramesRolloutPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  return (
    <AdminListPageShell
      eyebrow="Libraries"
      title="Generated frames"
      description="Give every event without a frame of its own the generated default frame. Dry run first. Global admin only."
      primaryAction={{ href: '/admin/frames', label: 'Global Frames' }}
      dbError={null}
    >
      <FrameBackfillConsole />
    </AdminListPageShell>
  );
}
