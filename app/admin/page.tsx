/**
 * Admin Dashboard
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { getAdminNavigationAccess, isGlobalAdminSession, listAccessiblePartnerIds } from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminDashboardView, { type DashboardAttentionMetrics } from '@/components/gds/AdminDashboardView';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { COLLECTIONS } from '@/lib/db/schemas';
import { collectActiveEventRows, type ActiveEventRow } from '@/lib/admin/active-events';
import { countWaitingPhotos } from '@/lib/photo-vetting/queue';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session) {
    redirect('/admin/login');
  }

  let metrics: DashboardAttentionMetrics | null = null;
  let activeEvents: ActiveEventRow[] = [];
  let dbError = null;
  // Defaults match app/admin/layout.tsx's own fallback shape, so a metrics
  // query failure below still renders a sensibly-scoped (if data-less) page.
  let navigationAccess = {
    isGlobalAdmin: isGlobalAdminSession(session),
    hasAnyPartnerAccess: isGlobalAdminSession(session),
    hasEventsAccess: isGlobalAdminSession(session),
  };

  try {
    const db = await connectToDatabase();
    navigationAccess = await getAdminNavigationAccess(db, session);

    if (navigationAccess.isGlobalAdmin) {
      const [eventsLiveCount, events, waitingPhotos] = await Promise.all([
        db.collection(COLLECTIONS.EVENTS).countDocuments({ isActive: true }),
        collectActiveEventRows(db, null),
        countWaitingPhotos(db, null),
      ]);
      metrics = {
        // Vetting is the photos waiting for approval (camera#284).
        pendingVettingCount: waitingPhotos.total,
        eventsLiveCount,
      };
      activeEvents = events;
    } else if (navigationAccess.hasAnyPartnerAccess) {
      // Partner-scoped: every metric is computed only from events this
      // session can access — a partner operator must never see another
      // partner's vetting counts on their own dashboard.
      const partnerIds = await listAccessiblePartnerIds(db, session, 'events');
      const events =
        partnerIds.length > 0
          ? await db
              .collection(COLLECTIONS.EVENTS)
              .find({ partnerId: { $in: partnerIds } }, { projection: { eventId: 1 } })
              .toArray()
          : [];
      const eventUuids = events.map((event) => event.eventId).filter((value): value is string => typeof value === 'string');
      const [eventsLiveCount, activeRows, waitingPhotos] = await Promise.all([
        db.collection(COLLECTIONS.EVENTS).countDocuments({ isActive: true, partnerId: { $in: partnerIds } }),
        collectActiveEventRows(db, partnerIds),
        countWaitingPhotos(db, eventUuids),
      ]);
      metrics = {
        pendingVettingCount: waitingPhotos.total,
        eventsLiveCount,
      };
      activeEvents = activeRows;
    }
  } catch (error) {
    console.error('Error loading admin dashboard:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminDashboardView
      navigationAccess={navigationAccess}
      metrics={metrics}
      activeEvents={activeEvents}
      dbError={dbError}
    />
  );
}
