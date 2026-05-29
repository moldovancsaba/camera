/**
 * Admin Events Listing
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { authEntryPathForCurrentHost } from '@/lib/auth/auth-entry';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  isGlobalAdminSession,
  listAccessiblePartnerIds,
  listSessionPartnerAssignments,
} from '@/lib/partners/authorization';
import { redirect } from 'next/navigation';
import AdminListPageShell from '@/components/admin/AdminListPageShell';
import EventsInventoryList, { type SerializedEventRow } from '@/components/gds/EventsInventoryList';
import { formatAdminDate, mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';

export const dynamic = 'force-dynamic';

interface EventListItem {
  _id?: unknown;
  name?: string;
  description?: string;
  partnerName?: string;
  location?: string;
  eventDate?: unknown;
  frames?: Array<{ frameId: string }>;
  isActive?: boolean;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; partner?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  let eventRows: SerializedEventRow[] = [];
  let partnerCount = 0;
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const partnerFilter =
    typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';
  let canCreate = isGlobalAdminSession(session);

  try {
    const db = await connectToDatabase();
    const accessiblePartnerIds = await listAccessiblePartnerIds(db, session, 'events');
    const assignments = await listSessionPartnerAssignments(db, session);
    canCreate =
      canCreate ||
      assignments.some(
        (assignment) =>
          assignment.isActive &&
          assignment.appKey === 'events' &&
          (assignment.role === 'manager' || assignment.role === 'admin')
      );

    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }
    if (partnerFilter) {
      query.partnerName = {
        $regex: `^${partnerFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        $options: 'i',
      };
    }
    if (!isGlobalAdminSession(session)) {
      query.partnerId = { $in: accessiblePartnerIds };
    }

    const events = (await db
      .collection(COLLECTIONS.EVENTS)
      .find(query)
      .sort({ eventDate: -1, createdAt: -1 })
      .limit(100)
      .toArray()) as unknown as EventListItem[];

    eventRows = [];
    for (const event of events) {
      const id = mongoIdString(event._id);
      if (!id) continue;
      eventRows.push({
        id,
        name: event.name || 'Untitled event',
        description: event.description ?? null,
        partnerName: event.partnerName || '—',
        location: event.location ?? null,
        eventDateLabel: formatAdminDate(event.eventDate),
        frameCount: Array.isArray(event.frames) ? event.frames.length : 0,
        isActive: Boolean(event.isActive),
      });
    }

    partnerCount = await db.collection(COLLECTIONS.PARTNERS).countDocuments(
      !isGlobalAdminSession(session)
        ? { isActive: true, partnerId: { $in: accessiblePartnerIds } }
        : { isActive: true }
    );
  } catch (error) {
    console.error('Error fetching events:', error);
    dbError = serializeMongoError(error);
  }

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Events App"
      description="Manage event app instances that use partner defaults, shared resources, and gallery flows."
      primaryAction={
        canCreate
          ? { href: '/admin/events/new', label: 'Add Event Instance', iconKey: 'plus' }
          : undefined
      }
      stats={
        !dbError
          ? [
              { label: 'Event Instances', value: eventRows.length, iconKey: 'calendarEvent' },
              { label: 'Active Partners', value: partnerCount, iconKey: 'buildingStore' },
              {
                label: 'Assigned Frames',
                value: eventRows.reduce((sum, event) => sum + event.frameCount, 0),
                iconKey: 'photoScan',
              },
            ]
          : undefined
      }
      toolbarHint="Create new event instances from a partner workspace whenever possible so the inheritance context stays explicit."
      toolbarFilters={
        partnerFilter
          ? [{ label: 'Partner', value: partnerFilter }]
          : search
            ? [{ label: 'Search', value: search }]
            : undefined
      }
      toolbarTrailing={{ href: '/admin/partners', label: 'Open Partners' }}
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Event name, description, or location',
        clearHref: '/admin/events',
        hiddenFields: partnerFilter ? { partner: partnerFilter } : undefined,
      }}
      dbError={dbError}
    >
      <EventsInventoryList events={eventRows} canCreate={canCreate} />
    </AdminListPageShell>
  );
}
