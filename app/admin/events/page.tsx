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
import ListPager from '@/components/admin/ListPager';
import EventsInventoryList, { type SerializedEventRow } from '@/components/gds/EventsInventoryList';
import { formatAdminDate, mongoIdString } from '@/lib/gds/serialize-admin-rows';
import { serializeMongoError } from '@/lib/gds/serialize-mongo-error';
import { pageNumber } from '@/lib/partners/list';

export const dynamic = 'force-dynamic';
const EVENTS_PAGE_SIZE = 50;

interface EventListItem {
  _id?: unknown;
  eventId?: string;
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
  searchParams?: Promise<{ search?: string; partner?: string; partnerId?: string; page?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect(await authEntryPathForCurrentHost());
  }

  let eventRows: SerializedEventRow[] = [];
  let matchingEventCount = 0;
  let partnerCount = 0;
  let assignedFrameCount = 0;
  let page = 1;
  let pages = 1;
  let partnerNameFilter = '';
  let dbError = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const partnerFilter =
    typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';
  const partnerIdFilter =
    typeof resolvedSearchParams?.partnerId === 'string' ? resolvedSearchParams.partnerId.trim() : '';
  const requestedPage = typeof resolvedSearchParams?.page === 'string' ? resolvedSearchParams.page : undefined;
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
    if (partnerIdFilter) {
      const partnerIsAccessible = isGlobalAdminSession(session) || accessiblePartnerIds.includes(partnerIdFilter);
      query.partnerId = partnerIsAccessible ? partnerIdFilter : { $in: [] };
      if (partnerIsAccessible) {
        const selectedPartner = await db.collection(COLLECTIONS.PARTNERS).findOne(
          { partnerId: partnerIdFilter },
          { projection: { name: 1 } }
        ) as { name?: string } | null;
        partnerNameFilter = selectedPartner?.name || partnerIdFilter;
      } else {
        // Keep a forged or stale partner filter empty without revealing partner details.
        partnerNameFilter = partnerIdFilter;
      }
    } else if (!isGlobalAdminSession(session)) {
      query.partnerId = { $in: accessiblePartnerIds };
    }

    const [totalEvents, frameAssignments] = await Promise.all([
      db.collection(COLLECTIONS.EVENTS).countDocuments(query),
      db
        .collection(COLLECTIONS.EVENTS)
        .aggregate<{ total: number }>([
          { $match: query },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $cond: [{ $isArray: '$frames' }, { $size: '$frames' }, 0],
                },
              },
            },
          },
        ])
        .toArray(),
    ]);
    matchingEventCount = totalEvents;
    assignedFrameCount = frameAssignments[0]?.total ?? 0;
    pages = Math.max(1, Math.ceil(matchingEventCount / EVENTS_PAGE_SIZE));
    page = pageNumber(requestedPage, pages);

    const events = (await db
      .collection(COLLECTIONS.EVENTS)
      .find(query)
      .sort({ eventDate: -1, createdAt: -1 })
      .skip((page - 1) * EVENTS_PAGE_SIZE)
      .limit(EVENTS_PAGE_SIZE)
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

  const hrefWithout = (key: 'search' | 'partner' | 'partnerId') => {
    const params = new URLSearchParams();
    if (key !== 'search' && search) params.set('search', search);
    if (key !== 'partner' && partnerFilter) params.set('partner', partnerFilter);
    if (key !== 'partnerId' && partnerIdFilter) params.set('partnerId', partnerIdFilter);
    const queryString = params.toString();
    return queryString ? `/admin/events?${queryString}` : '/admin/events';
  };
  const toolbarFilters = [
    ...(partnerIdFilter
      ? [{ label: 'Partner', value: partnerNameFilter || partnerIdFilter, removeHref: hrefWithout('partnerId') }]
      : []),
    ...(partnerFilter ? [{ label: 'Partner', value: partnerFilter, removeHref: hrefWithout('partner') }] : []),
    ...(search ? [{ label: 'Search', value: search, removeHref: hrefWithout('search') }] : []),
  ];
  const pagerQuery = Object.fromEntries(
    Object.entries({ search, partner: partnerFilter, partnerId: partnerIdFilter }).filter(([, value]) => value)
  );

  return (
    <AdminListPageShell
      eyebrow="Apps"
      title="Events"
      primaryAction={
        canCreate
          ? { href: '/admin/events/new', label: 'Add Event Instance', iconKey: 'plus' }
          : undefined
      }
      stats={
        !dbError
          ? [
              { label: search || partnerFilter || partnerIdFilter ? 'Matching Events' : 'Event Instances', value: matchingEventCount, iconKey: 'calendarEvent' },
              { label: 'Active Partners', value: partnerCount, iconKey: 'buildingStore' },
              {
                label: 'Assigned Frames',
                value: assignedFrameCount,
                iconKey: 'photoScan',
              },
            ]
          : undefined
      }
      toolbarHint="Create new event instances from a partner workspace whenever possible so the inheritance context stays explicit."
      toolbarTrailing={{ href: '/admin/partners', label: 'Open Partners' }}
      search={{
        defaultValue: search,
        label: 'Search',
        placeholder: 'Event name, description, or location',
        clearHref: '/admin/events',
        hiddenFields: {
          ...(partnerFilter ? { partner: partnerFilter } : {}),
          ...(partnerIdFilter ? { partnerId: partnerIdFilter } : {}),
        },
      }}
      toolbarFilters={toolbarFilters.length ? toolbarFilters : undefined}
      dbError={dbError}
    >
      <EventsInventoryList events={eventRows} canCreate={canCreate} />
      {!dbError ? <ListPager basePath="/admin/events" query={pagerQuery} page={page} pages={pages} total={matchingEventCount} pageSize={EVENTS_PAGE_SIZE} /> : null}
    </AdminListPageShell>
  );
}
