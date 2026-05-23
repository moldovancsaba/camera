/**
 * Admin Events Listing
 * 
 * List all events with search, filter by partner, and pagination
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
import { IconBuildingStore, IconCalendarEvent, IconPhotoScan, IconPlus, IconSearch } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';
import StatsStrip from '@/components/gds/StatsStrip';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';

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
  const partnerFilter = typeof resolvedSearchParams?.partner === 'string' ? resolvedSearchParams.partner.trim() : '';
  const session = await getSession();
  let canCreate = isGlobalAdminSession(session);

  try {
    const db = await connectToDatabase();
    const accessiblePartnerIds = await listAccessiblePartnerIds(db, session!, 'events');
    const assignments = await listSessionPartnerAssignments(db, session!);
    canCreate = canCreate || assignments.some(
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
      query.partnerName = { $regex: `^${partnerFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }
    if (!isGlobalAdminSession(session)) {
      query.partnerId = { $in: accessiblePartnerIds };
    }
    
    // Get events
    events = await db
      .collection(COLLECTIONS.EVENTS)
      .find(query)
      .sort({ eventDate: -1, createdAt: -1 })
      .limit(100)
      .toArray() as unknown as EventListItem[];

    // Get partners for filtering
    partners = await db
      .collection(COLLECTIONS.PARTNERS)
      .find(
        !isGlobalAdminSession(session)
          ? { isActive: true, partnerId: { $in: accessiblePartnerIds } }
          : { isActive: true }
      )
      .sort({ name: 1 })
      .toArray() as unknown as PartnerListItem[];

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
            <Link href="/admin/events/new" style={{ textDecoration: 'none' }}>
              <Button color="cameraTeal" leftSection={<IconPlus size={16} />}>
                Add Event Instance
              </Button>
            </Link>
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

      <Card>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Create new event instances from a partner workspace whenever possible so the inheritance context stays explicit.
          </Text>
          <form>
            <Group align="end">
              <TextInput
                name="search"
                defaultValue={search}
                label="Search"
                placeholder="Search event name, description, or location"
                leftSection={<IconSearch size={16} />}
                style={{ flex: 1 }}
              />
              <input type="hidden" name="partner" value={partnerFilter} />
              <Button type="submit" color="cameraTeal">
                Search
              </Button>
              {(search || partnerFilter) ? (
                <Link href="/admin/events" style={{ textDecoration: 'none' }}>
                  <Button variant="default">Clear</Button>
                </Link>
              ) : null}
              <Link href="/admin/partners" style={{ textDecoration: 'none' }}>
                <Button variant="light" color="cameraTeal">
                  Open Partners
                </Button>
              </Link>
            </Group>
          </form>
        </Stack>
      </Card>
      {partnerFilter ? (
        <Text size="sm" c="dimmed">
          Filtering by partner: <Text span fw={700} c="dark.8">{partnerFilter}</Text>
        </Text>
      ) : null}

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && events.length === 0 ? (
        <Card p="xl">
          <Stack align="center" gap="sm">
            <Text fz={48}>🎯</Text>
            <Text fw={700} fz="lg">
              No events yet
            </Text>
            <Text c="dimmed" ta="center">
              Get started by creating the first event app instance for a partner.
            </Text>
            {canCreate ? (
              <Link href="/admin/events/new" style={{ textDecoration: 'none' }}>
                <Button color="cameraTeal">Add Your First Event Instance</Button>
              </Link>
            ) : null}
          </Stack>
        </Card>
      ) : (
        <DataTable
          columns={[
            { key: 'event', title: 'Event Instance' },
            { key: 'partner', title: 'Partner' },
            { key: 'date', title: 'Date' },
            { key: 'frames', title: 'Frames' },
            { key: 'status', title: 'Status' },
            { key: 'actions', title: 'Actions', align: 'right' },
          ]}
        >
          {events.map((event) => (
            <tr key={event._id.toString()} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <Stack gap={2}>
                  <Link
                    href={`/admin/events/${event._id}`}
                    style={{ textDecoration: 'none', color: 'var(--mantine-color-blue-7)', fontWeight: 700 }}
                  >
                    {event.name}
                  </Link>
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
                <Link
                  href={`/admin/partners?search=${encodeURIComponent(event.partnerName)}`}
                  style={{ textDecoration: 'none', color: 'var(--mantine-color-blue-7)' }}
                >
                  {event.partnerName}
                </Link>
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
                  <Link href={`/admin/events/${event._id}`} style={{ textDecoration: 'none' }}>
                    <Button variant="subtle" size="compact-sm">
                      View
                    </Button>
                  </Link>
                  <Link href={`/admin/events/${event._id}/edit`} style={{ textDecoration: 'none' }}>
                    <Button variant="subtle" size="compact-sm">
                      Edit
                    </Button>
                  </Link>
                </Group>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Stack>
  );
}
