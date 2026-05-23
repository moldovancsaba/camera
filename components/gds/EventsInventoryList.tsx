'use client';

import Link from 'next/link';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import DataTable from '@/components/gds/DataTable';
import StatusBadge from '@/components/gds/StatusBadge';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';
import StateBlock from '@/components/gds/StateBlock';

export interface SerializedEventRow {
  id: string;
  name: string;
  description?: string | null;
  partnerName: string;
  location?: string | null;
  eventDateLabel: string;
  frameCount: number;
  isActive: boolean;
}

function EventMobileCard({ event }: { event: SerializedEventRow }) {
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text
              component={Link}
              href={`/admin/events/${event.id}`}
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
          {event.eventDateLabel} · {event.frameCount} frames
        </Text>
        <Group gap="sm">
          <Button component={Link} href={`/admin/events/${event.id}`} variant="light" size="compact-sm">
            View
          </Button>
          <Button component={Link} href={`/admin/events/${event.id}/edit`} variant="subtle" size="compact-sm">
            Edit
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export default function EventsInventoryList({
  events,
  canCreate,
}: {
  events: SerializedEventRow[];
  canCreate: boolean;
}) {
  if (events.length === 0) {
    return (
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
    );
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
    <ResponsiveDataView
      table={
        <DataTable columns={tableColumns}>
          {events.map((event) => (
            <tr key={event.id} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
              <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                <Stack gap={2}>
                  <Text
                    component={Link}
                    href={`/admin/events/${event.id}`}
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
                  {event.eventDateLabel}
                </Text>
              </td>
              <td style={{ padding: '1rem 1.5rem' }}>{event.frameCount}</td>
              <td style={{ padding: '1rem 1.5rem' }}>
                <StatusBadge tone={event.isActive ? 'active' : 'inactive'} />
              </td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                <Group gap="sm" justify="flex-end">
                  <Button component={Link} href={`/admin/events/${event.id}`} variant="subtle" size="compact-sm">
                    View
                  </Button>
                  <Button component={Link} href={`/admin/events/${event.id}/edit`} variant="subtle" size="compact-sm">
                    Edit
                  </Button>
                </Group>
              </td>
            </tr>
          ))}
        </DataTable>
      }
      mobile={events.map((event) => (
        <EventMobileCard key={event.id} event={event} />
      ))}
    />
  );
}
