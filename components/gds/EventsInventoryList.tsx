'use client';

import Link from 'next/link';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { StateBlock } from '@doneisbetter/gds-core/client';
import { StatusBadge } from '@doneisbetter/gds-core/client';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

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
          <StatusBadge {...getStatusBadgeProps(event.isActive ? 'active' : 'inactive')} />
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

  return (
    <ResponsiveDataView
      data={events}
      columns={[
        {
          key: 'event',
          label: 'Event Instance',
          render: (event) => (
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
          ),
        },
        {
          key: 'partner',
          label: 'Partner',
          render: (event) => (
            <Text
              component={Link}
              href={`/admin/partners?search=${encodeURIComponent(event.partnerName)}`}
              c="blue.7"
              style={{ textDecoration: 'none' }}
            >
              {event.partnerName}
            </Text>
          ),
        },
        {
          key: 'date',
          label: 'Date',
          render: (event) => (
            <Text size="sm" c="dimmed">
              {event.eventDateLabel}
            </Text>
          ),
        },
        { key: 'frames', label: 'Frames', render: (event) => event.frameCount },
        {
          key: 'status',
          label: 'Status',
          render: (event) => <StatusBadge {...getStatusBadgeProps(event.isActive ? 'active' : 'inactive')} />,
        },
        {
          key: 'actions',
          label: 'Actions',
          render: (event) => (
            <Group gap="sm" justify="flex-end">
              <Button component={Link} href={`/admin/events/${event.id}`} variant="subtle" size="compact-sm">
                View
              </Button>
              <Button component={Link} href={`/admin/events/${event.id}/edit`} variant="subtle" size="compact-sm">
                Edit
              </Button>
            </Group>
          ),
        },
      ]}
      renderCard={(event) => <EventMobileCard event={event} />}
      getRowKey={(event) => event.id}
    />
  );
}
