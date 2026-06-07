'use client';

import Link from 'next/link';
import {
  AdminResourceCard,
  AdminResourceEmptyState,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@doneisbetter/gds-admin/client';
import { SimpleGrid } from '@mantine/core';
import { StatusBadge } from '@doneisbetter/gds-core/client';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

export interface SerializedEventRow {
  id: string;
  name: string;
  description?: string | null;
  partnerName: string;
  location?: string | null;
  eventDateLabel: string;
  frameCount: number;
  pendingTryOnVettingCount: number;
  isActive: boolean;
}

export default function EventsInventoryList({
  events,
  canCreate,
}: {
  events: SerializedEventRow[];
  canCreate: boolean;
}) {
  const records: Array<AdminResourceRecord & SerializedEventRow> = events.map((event) => ({
    ...event,
    id: event.id,
    title: event.name,
    description: event.description || event.location || event.partnerName,
    status: <StatusBadge {...getStatusBadgeProps(event.isActive ? 'active' : 'inactive')} />,
    metadata: [
      { label: 'Partner', value: event.partnerName },
      event.location ? { label: 'Location', value: event.location } : null,
      { label: 'Date', value: event.eventDateLabel },
      { label: 'Frames', value: String(event.frameCount) },
      { label: 'Vetting', value: String(event.pendingTryOnVettingCount) },
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
  }));

  if (events.length === 0) {
    return (
      <AdminResourceEmptyState
          title="No events yet"
          description="Get started by creating the first event app instance for a partner."
          action={
            canCreate ? (
              <Link href="/admin/events/new">
                Add Your First Event Instance
              </Link>
            ) : undefined
          }
        />
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {records.map((event) => {
        const actions: Array<AdminResourceAction<typeof event>> = [
          {
            id: 'view',
            label: 'View',
            kind: 'primary',
            onSelect: () => {
              window.location.href = `/admin/events/${event.id}`;
            },
          },
          {
            id: 'edit',
            label: 'Edit',
            kind: 'secondary',
            onSelect: () => {
              window.location.href = `/admin/events/${event.id}/edit`;
            },
          },
          {
            id: 'vetting',
            label: `Vetting (${event.pendingTryOnVettingCount})`,
            kind: 'secondary',
            onSelect: () => {
              window.location.href = `/admin/tryon/vetting?eventId=${encodeURIComponent(event.id)}`;
            },
          },
        ];

        return <AdminResourceCard key={event.id} record={event} actions={actions} />;
      })}
    </SimpleGrid>
  );
}
