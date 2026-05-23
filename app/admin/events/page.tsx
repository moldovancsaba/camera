/**
 * Admin Events Listing
 *
 * List all events with search, filter by partner, and pagination.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import {
  isGlobalAdminSession,
  listAccessiblePartnerIds,
  listSessionPartnerAssignments,
} from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core';
import {
  IconBuildingStore,
  IconCalendarEvent,
  IconPhotoScan,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';
import DataToolbar from '@/components/gds/DataToolbar';
import StateBlock from '@/components/gds/StateBlock';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';

interface EventListItem {
  _id: { toString(): string };
  name: string;
  description?: string;
  partnerName: string;
  location?: string;
  eventDate?: string;
  frames?: Array<{ frameId: string }>;
  isActive: boolean;
}

interface PartnerListItem {
  _id: { toString(): string };
}

function EventMobileCard({ event }: { event: EventListItem }) {
  const id = event._id.toString();
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text
              component={Link}
              href={`/admin/events/${id}`}
              fw={700}
              c="blue.7"
              lineClamp={2}
              style={{ textDecoration: 'none' }}
            >
              {event.name}
            </Text>
            {event.description ? (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {event.description}
              </Text>
            ) : null}
          </Stack>
          <StatusBadge tone={event.isActive ? 'active' : 'inactive'} />
        </Group>
        <Text size="sm" c="dimmed">
          {event.partnerName}
          {event.location ? ` · ${event.location}` : ''}
        </Text>
        <Text size="xs" c="dimmed">
          {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : 'No date'} ·{' '}
          {event.frames?.length || 0} frames
        </Text>
        <Group gap="sm">
          <Button component={Link} href={`/admin/events/${id}`} variant="light" size="compact-sm">
            View
          </Button>
          <Button component={Link} href={`/admin/events/${id}/edit`} variant="subtle" size="compact-sm">
            Edit
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; partner?: string }>;
}) {
  let events: EventListItem[] = [];
  let partners: PartnerListItem[] = [];
  let dbError: unknown = null;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const search = typeof resolvedSearchParams?.search === 'string' ? resolvedSearchParams.search.trim() : '';
  const partnerFilter =
    typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';
  const session = await getSession();
  let canCreate = isGlobalAdminSession(session);

  try {
    const db = await connectToDatabase();
    const accessiblePartnerIds = await listAccessiblePartnerIds(db, session!, 'events');
    const assignments = await listSessionPartnerAssignments(db, session!);
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

    events = (await db
      .collection(COLLECTIONS.EVENTS)
      .find(query)
      .sort({ eventDate: -1, createdAt: -1 })
      .limit(100)
      .toArray()) as unknown as EventListItem[];

    partners = (await db
      .collection(COLLECTIONS.PARTNERS)
      .find(
        !isGlobalAdminSession(session)
          ? { isActive: true, partnerId: { $in: accessiblePartnerIds } }
          : { isActive: true }
      )
      .sort({ name: 1 })
      .toArray()) as unknown as PartnerListItem[];
  } catch (error) {
    console.error('Error fetching events:', error);
    dbError = error;
  }

  const tableColumns = [
    { key: 'event', title: 'Event Instance' },
    { key: 'partner', title: 'Partner' },
    { key: 'date', title: 'Date' },
    { key: 'frames', title: 'Frames' },
    { key: 'status', title: 'Status' },
    { key: 'actions', title: 'Actions', align: 'right' as const },
  ];

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
            { label: 'Event Instances', value: events.length, icon: <IconCalendarEvent size={20} /> },
            { label: 'Active Partners', value: partners.length, icon: <IconBuildingStore size={20} /> },
            {
              label: 'Assigned Frames',
              value: events.reduce((sum, event) => sum + (event.frames?.length || 0), 0),
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

      {!dbError && events.length === 0 ? (
        <Card>
          <StateBlock
            variant="empty"
            title="No events yet"
            description="Get started by creating the first event app instance for a partner."
            action={
              canCreate ? (
                <Button component={Link} href="/admin/events/new" color="cameraTeal">
                  Add Your First Event Instance
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : !dbError ? (
        <ResponsiveDataView
          table={
            <DataTable columns={tableColumns}>
              {events.map((event) => (
                <tr key={event._id.toString()} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                  <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                    <Stack gap={2}>
                      <Text
                        component={Link}
                        href={`/admin/events/${event._id}`}
                        fw={700}
                        c="blue.7"
                        style={{ textDecoration: 'none' }}
                      >
                        {event.name}
                      </Text>
                      {event.description ? (
                        <Text size="sm" c="dimmed" lineClamp={1}>
                          {event.description}
                        </Text>
                      ) : null}
                      {event.location ? (
                        <Text size="xs" c="dimmed">
                          {event.location}
                        </Text>
                      ) : null}
                    </Stack>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <Text
                      component={Link}
                      href={`/admin/partners?search=${encodeURIComponent(event.partnerName)}`}
                      c="blue.7"
                      style={{ textDecoration: 'none' }}
                    >
                      {event.partnerName}
                    </Text>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <Text size="sm" c="dimmed">
                      {event.eventDate ? new Date(event.eventDate).toLocaleDateString() : '—'}
                    </Text>
                  </td>
                  <td style={{ padding: '1rem 1.5rem' }}>{event.frames?.length || 0}</td>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <StatusBadge tone={event.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                    <Group gap="sm" justify="flex-end">
                      <Button component={Link} href={`/admin/events/${event._id}`} variant="subtle" size="compact-sm">
                        View
                      </Button>
                      <Button component={Link} href={`/admin/events/${event._id}/edit`} variant="subtle" size="compact-sm">
                        Edit
                      </Button>
                    </Group>
                  </td>
                </tr>
              ))}
            </DataTable>
          }
          mobile={events.map((event) => (
            <EventMobileCard key={event._id.toString()} event={event} />
          ))}
        />
      ) : null}
    </Stack>
  );
}
