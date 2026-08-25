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
import {
  collectActiveEventRows,
  collectScopedTryOnDashboardMetrics,
  collectTryOnDashboardMetrics,
  type ActiveEventRow,
} from '@/lib/tryon/dashboard-metrics';
import { formatTryOnWorkerHealthDescription, formatTryOnWorkerHealthTitle } from '@/lib/tryon/worker-health';

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
      const [tryOnMetrics, eventsLiveCount, events] = await Promise.all([
        collectTryOnDashboardMetrics(db),
        db.collection(COLLECTIONS.EVENTS).countDocuments({ isActive: true }),
        collectActiveEventRows(db, null),
      ]);
      metrics = {
        pendingVettingCount: tryOnMetrics.pendingVettingCount,
        activeQueueTotal: tryOnMetrics.activeQueueTotal,
        eventsLiveCount,
        workerHealthTitle: tryOnMetrics.workerHealth ? formatTryOnWorkerHealthTitle(tryOnMetrics.workerHealth) : 'Worker unknown',
        workerHealthDescription: tryOnMetrics.workerHealth ? formatTryOnWorkerHealthDescription(tryOnMetrics.workerHealth) : null,
      };
      activeEvents = events;
    } else if (navigationAccess.hasAnyPartnerAccess) {
      // Partner-scoped: every metric is computed only from events this
      // session can access — a partner operator must never see another
      // partner's queue or vetting counts on their own dashboard.
      const partnerIds = await listAccessiblePartnerIds(db, session, 'events');
      const events =
        partnerIds.length > 0
          ? await db
              .collection(COLLECTIONS.EVENTS)
              .find({ partnerId: { $in: partnerIds } }, { projection: { eventId: 1 } })
              .toArray()
          : [];
      const eventUuids = events.map((event) => event.eventId).filter((value): value is string => typeof value === 'string');
      const eventMongoIds = events.map((event) => String(event._id));
      const [scoped, eventsLiveCount, activeRows] = await Promise.all([
        collectScopedTryOnDashboardMetrics(db, eventUuids, eventMongoIds),
        db.collection(COLLECTIONS.EVENTS).countDocuments({ isActive: true, partnerId: { $in: partnerIds } }),
        collectActiveEventRows(db, partnerIds),
      ]);
      metrics = {
        pendingVettingCount: scoped.pendingVettingCount,
        activeQueueTotal: scoped.activeQueueTotal,
        eventsLiveCount,
        workerHealthTitle: null,
        workerHealthDescription: null,
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
