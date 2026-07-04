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

export interface SerializedSlideshowRow {
  id: string;
  slideshowId: string;
  eventId: string;
  eventMongoId: string;
  eventName: string;
  partnerName?: string | null;
  name: string;
  isActive: boolean;
  transitionDurationMs: number;
  fadeDurationMs: number;
  bufferSize: number;
  refreshStrategy: 'continuous' | 'batch';
  playMode: 'once' | 'loop';
  orderMode: 'fixed' | 'random';
  updatedAtLabel: string;
}

export default function SlideshowsInventoryList({
  slideshows,
}: {
  slideshows: SerializedSlideshowRow[];
}) {
  const records: Array<AdminResourceRecord & SerializedSlideshowRow> = slideshows.map((slideshow) => ({
    ...slideshow,
    id: slideshow.id,
    title: slideshow.name,
    description: `/slideshow/${slideshow.slideshowId}`,
    status: <StatusBadge {...getStatusBadgeProps(slideshow.isActive ? 'active' : 'inactive')} />,
    metadata: [
      { label: 'Event', value: slideshow.eventName },
      { label: 'Partner', value: slideshow.partnerName || 'Unknown partner' },
      {
        label: 'Playback',
        value: `${slideshow.playMode} · ${slideshow.refreshStrategy} · ${slideshow.orderMode} · buffer ${slideshow.bufferSize}`,
      },
      {
        label: 'Timing',
        value: `${slideshow.transitionDurationMs}ms transition · ${slideshow.fadeDurationMs}ms fade`,
      },
      { label: 'Updated', value: slideshow.updatedAtLabel },
    ],
  }));

  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedSlideshowRow>> = [
    {
      id: 'edit',
      label: 'Edit',
      kind: 'secondary',
      disabled: (slideshow) => !slideshow.eventMongoId,
      onSelect: (slideshow) => {
        window.location.href = `/admin/events/${slideshow.eventMongoId}/slideshows/${slideshow.id}`;
      },
    },
    {
      id: 'event',
      label: 'Open Event',
      kind: 'icon',
      disabled: (slideshow) => !slideshow.eventMongoId,
      onSelect: (slideshow) => {
        window.location.href = `/admin/events/${slideshow.eventMongoId}`;
      },
    },
  ];

  if (slideshows.length === 0) {
    return (
      <AdminResourceEmptyState
        title="No slideshows yet"
        description="Create a slideshow from an event workspace, then manage it here from the global inventory."
        action={
          <Link href="/admin/events">
            Open Events
          </Link>
        }
      />
    );
  }

  return (
    <AdminResourceManager
      records={records}
      state="ready"
      actions={actions}
      onPreview={(slideshow) => {
        window.open(`/slideshow/${slideshow.slideshowId}`, '_blank', 'noopener,noreferrer');
      }}
    />
  );
}
