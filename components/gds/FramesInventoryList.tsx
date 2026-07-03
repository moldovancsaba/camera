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

export interface SerializedFrameRow {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl: string;
  isActive: boolean;
  scope: 'global' | 'partner' | 'event';
  usageCount: number;
  partnerId?: string | null;
  partnerName?: string | null;
  partnerAdminId?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  eventAdminId?: string | null;
}

export default function FramesInventoryList({ frames }: { frames: SerializedFrameRow[] }) {
  const records: Array<AdminResourceRecord & SerializedFrameRow> = frames.map((frame) => ({
    ...frame,
    id: frame.id,
    title: frame.name,
    description: frame.description || frame.category || 'Shared frame',
    mediaSrc: frame.imageUrl,
    mediaAlt: frame.name,
    status: (
      <>
        <StatusBadge
          {...getStatusBadgeProps(
            frame.scope === 'event' ? 'active' : frame.scope === 'partner' ? 'info' : 'inactive',
            frame.scope === 'global' ? 'Global' : frame.scope === 'partner' ? 'Partner' : 'Event'
          )}
        />
        <StatusBadge {...getStatusBadgeProps(frame.isActive ? 'active' : 'inactive')} />
      </>
    ),
    metadata: [
      { label: 'Category', value: frame.category || 'general' },
      { label: 'Usage', value: `${frame.usageCount} assignment${frame.usageCount === 1 ? '' : 's'}` },
      frame.partnerName ? { label: 'Partner', value: frame.partnerName } : null,
      frame.eventName ? { label: 'Event', value: frame.eventName } : null,
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
  }));
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedFrameRow>> = [
    {
      id: 'edit',
      label: 'Edit',
      kind: 'primary',
      onSelect: (frame) => {
        window.location.href = `/admin/frames/${frame.id}/edit`;
      },
    },
  ];

  if (frames.length === 0) {
    return (
      <AdminResourceEmptyState
          title="No frames yet"
          description="Add your first shared frame to start assigning it across partners and apps."
          action={
            <Link href="/admin/frames/new">
              Add Your First Frame
            </Link>
          }
        />
    );
  }

  return (
    <AdminResourceManager records={records} state="ready" actions={actions} />
  );
}
