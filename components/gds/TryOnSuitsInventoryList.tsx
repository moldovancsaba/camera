'use client';

import Link from 'next/link';
import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { getStatusChipContent } from '@/lib/gds/statusChipContent';

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
    status: getStatusChipContent({ tone: suit.isActive ? 'active' : 'inactive' }),
    metadata: [
      { label: 'Catalog ID', value: suit.leatherSuitId },
      { label: 'Event allowlists', value: String(suit.eventAssignmentCount) },
      { label: 'Queue usage', value: String(suit.queueUsageCount) },
    ],
  }));
  // GDS AdminResourceCard renders every non-danger primary/secondary action with
  // the "edit" label, and ignores onPreview when a primary action exists. To avoid
  // multiple identical "Edit" buttons we keep no primary action (the garment image
  // opens via onPreview's Preview affordance), a single 'edit' secondary, and the
  // Asset Builder as an icon action (its own slot).
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedTryOnSuitRow>> = [
    {
      id: 'edit',
      label: 'Edit Garment',
      kind: 'secondary',
      onSelect: (suit) => {
        window.location.href = `/admin/tryon/suits/${suit.id}/edit`;
      },
    },
    {
      id: 'analytics',
      label: 'Asset Builder',
      kind: 'icon',
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

  return (
    <AdminResourceManager
      records={records}
      state="ready"
      actions={actions}
      onPreview={(suit) => {
        window.open(suit.imageUrl, '_blank', 'noopener,noreferrer');
      }}
    />
  );
}
