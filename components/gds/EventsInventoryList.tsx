'use client';

import Link from 'next/link';
import {
  AdminResourceEmptyState,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { ResourceListGrid } from '@/components/gds/ResourceListGrid';
import { getStatusChipContent } from '@/lib/gds/statusChipContent';

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
    status: getStatusChipContent({ tone: event.isActive ? 'active' : 'inactive' }),
    metadata: [
      { label: 'Partner', value: event.partnerName },
      event.location ? { label: 'Location', value: event.location } : null,
      { label: 'Date', value: event.eventDateLabel },
      { label: 'Frames', value: String(event.frameCount) },
      { label: 'Vetting', value: String(event.pendingTryOnVettingCount) },
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
  }));

  // Viewing goes through onPreview below rather than a second action, keeping
  // a single "Edit" button per card. "Vetting" is a separate icon action so
  // it stays visually distinct from "Edit".
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedEventRow>> = [
    {
      id: 'edit',
      label: 'Edit',
      kind: 'secondary',
      onSelect: (event) => {
        window.location.href = `/admin/events/${event.id}/edit`;
      },
    },
    {
      id: 'vetting',
      label: 'Vetting',
      kind: 'icon',
      disabled: (event) => event.pendingTryOnVettingCount <= 0,
      onSelect: (event) => {
        window.location.href = `/admin/tryon/vetting?eventId=${encodeURIComponent(event.id)}`;
      },
    },
  ];

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
    <ResourceListGrid
      records={records}
      actions={actions}
      onPreview={(event) => {
        window.location.href = `/admin/events/${event.id}`;
      }}
    />
  );
};
