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
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import {
  IconBuildingStore,
  IconCalendarEvent,
  IconPhotoScan,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import DataToolbar from '@/components/gds/DataToolbar';
import EventsInventoryList, { type SerializedEventRow } from '@/components/gds/EventsInventoryList';
import { formatAdminDate, mongoIdString } from '@/lib/gds/serialize-admin-rows';

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
  let dbError: unknown = null;
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
    dbError = error;
  }

  return (
    <Stack gap="xl">
      <WorkspaceHeader
        eyebrow="Apps"
        title="Events App"
        description="Manage event app instances that use partner defaults, shared resources, and gallery flows."
        actions={
          canCreate ? (
            <Button component={Link} href="/admin/events/new" color="cameraTeal" leftSection={<IconPlus size={16} />}>
              Add Event Instance
            </Button>
          ) : null
        }
      />

      {!dbError && (
        <StatsStrip
          items={[
            { label: 'Event Instances', value: eventRows.length, icon: <IconCalendarEvent size={20} /> },
            { label: 'Active Partners', value: partnerCount, icon: <IconBuildingStore size={20} /> },
            {
              label: 'Assigned Frames',
              value: eventRows.reduce((sum, event) => sum + event.frameCount, 0),
              icon: <IconPhotoScan size={20} />,
            },
          ]}
        />
      )}

      <DataToolbar
        hint="Create new event instances from a partner workspace whenever possible so the inheritance context stays explicit."
        filters={
          partnerFilter
            ? [{ label: 'Partner', value: partnerFilter }]
            : search
              ? [{ label: 'Search', value: search }]
              : undefined
        }
        trailing={
          <Button component={Link} href="/admin/partners" variant="light" color="cameraTeal">
            Open Partners
          </Button>
        }
      >
        <form style={{ flex: 1, minWidth: 240 }}>
          <Group align="flex-end" wrap="wrap">
            <TextInput
              name="search"
              defaultValue={search}
              label="Search"
              placeholder="Event name, description, or location"
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1, minWidth: 220 }}
            />
            <input type="hidden" name="partner" value={partnerFilter} />
            <Button type="submit" color="cameraTeal">
              Search
            </Button>
            {search || partnerFilter ? (
              <Button component={Link} href="/admin/events" variant="default">
                Clear
              </Button>
            ) : null}
          </Group>
        </form>
      </DataToolbar>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError ? <EventsInventoryList events={eventRows} canCreate={canCreate} /> : null}
    </Stack>
  );
}
