import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import WaitingPhotosCard from '@/components/admin/WaitingPhotosCard';
import { getSession } from '@/lib/auth/session';
import { connectToDatabase } from '@/lib/db/mongodb';
import { eventVettingPath } from '@/lib/admin/vetting-path';
import { isGlobalAdminSession } from '@/lib/partners/authorization';

export const dynamic = 'force-dynamic';

// WHAT: The vetting page across events (global admins): the events whose photos wait for approval, each opening its own Vetting tab.
// WHY: this was the header of /admin/tryon/vetting, the page of the try-on integration that also hosted the cross-event photo vetting
// card. The dashboard and the admin menu link here now (issue 557, docs/TRYON_REMOVED.md). The old address and the messmass link to it
// (`/admin/tryon/vetting?eventId=<event uuid>`) are redirected here by next.config.ts; an `eventId` (the event's uuid or its id) goes on
// to that event's own Vetting tab, as the link always meant "vetting of this event".
export default async function AdminVettingPage({
  searchParams,
}: {
  searchParams?: Promise<{ eventId?: string }>;
}) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin');
  }

  const query = searchParams ? await searchParams : {};
  const eventRef = typeof query.eventId === 'string' ? query.eventId.trim() : '';
  if (eventRef) {
    const path = await eventVettingPath(await connectToDatabase(), eventRef);
    if (path) redirect(path);
  }

  return (
    <AdminListPageShell
      eyebrow="Operations"
      title="Vetting"
      description="Photos waiting for approval, by event. Open an event to approve or reject its photos."
      status="Global Admin"
      primaryAction={{ href: '/admin/events', label: 'Events' }}
      dbError={null}
    >
      <WaitingPhotosCard showWhenEmpty />
    </AdminListPageShell>
  );
}
