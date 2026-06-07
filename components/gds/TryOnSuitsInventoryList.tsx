'use client';

import Link from 'next/link';
import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@doneisbetter/gds-admin/client';
import { StatusBadge } from '@doneisbetter/gds-core/client';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

export interface SerializedTryOnSuitRow {
  id: string;
  leatherSuitId: string;
  name: string;
  description?: string | null;
  imageUrl: string;
  thumbnailUrl?: string | null;
  isActive: boolean;
  eventAssignmentCount: number;
  queueUsageCount: number;
}

export default function TryOnSuitsInventoryList({ suits }: { suits: SerializedTryOnSuitRow[] }) {
  const records: Array<AdminResourceRecord & SerializedTryOnSuitRow> = suits.map((suit) => ({
    ...suit,
    id: suit.id,
    title: suit.name,
    description: suit.description || suit.leatherSuitId,
    mediaSrc: suit.thumbnailUrl || suit.imageUrl,
    mediaAlt: suit.name,
    status: <StatusBadge {...getStatusBadgeProps(suit.isActive ? 'active' : 'inactive')} />,
    metadata: [
      { label: 'Catalog ID', value: suit.leatherSuitId },
      { label: 'Event allowlists', value: String(suit.eventAssignmentCount) },
      { label: 'Queue usage', value: String(suit.queueUsageCount) },
    ],
  }));
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedTryOnSuitRow>> = [
    {
      id: 'edit',
      label: 'Edit Garment',
      kind: 'primary',
      onSelect: (suit) => {
        window.location.href = `/admin/tryon/suits/${suit.id}/edit`;
      },
    },
    {
      id: 'analytics',
      label: 'Asset Builder',
      kind: 'secondary',
      onSelect: (suit) => {
        window.location.href = `/admin/tryon/analytics?garment=${encodeURIComponent(suit.leatherSuitId)}`;
      },
    },
  ];

  if (suits.length === 0) {
    return (
      <AdminResourceEmptyState
          title="No garments yet"
          description="Upload your first shared garment so try-on events can offer it to users."
          action={
            <Link href="/admin/tryon/suits/new">
              Upload First Garment
            </Link>
          }
        />
    );
  }

  return <AdminResourceManager records={records} state="ready" actions={actions} />;
}
