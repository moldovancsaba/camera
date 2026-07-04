'use client';

import Link from 'next/link';
import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { StatusBadge } from '@sovereignsquad/gds-core/client';
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

  // "View" is intentionally NOT a primary action: GDS AdminResourceCard forces
  // every non-danger primary/secondary action to the "edit" semantic, so a
  // primary 'view' rendered as a second button labelled "Edit". Viewing is wired
  // through onPreview below (the card's eye/Preview affordance), leaving a single
  // "Edit" secondary button.
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
      // Rendered as an icon action, not a second 'secondary' text button: the GDS
      // AdminResourceCard collapses every non-danger secondary action to the "edit"
      // semantic id, so two secondary actions would render as two identical "Edit"
      // buttons sharing the React key `secondary-edit`. Icon actions get their own
      // slot and keep this affordance distinct.
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
    <AdminResourceManager
      records={records}
      state="ready"
      actions={actions}
      onPreview={(event) => {
        window.location.href = `/admin/events/${event.id}`;
      }}
    />
  );
};
