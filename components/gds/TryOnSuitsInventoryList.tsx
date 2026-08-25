'use client';

import Link from 'next/link';
import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { getStatusChipContent } from '@/lib/gds/statusChipContent';
import type { GarmentType, SleeveStyle } from '@/lib/db/schemas';

const GARMENT_TYPE_LABELS: Record<GarmentType, string> = {
  motorsport_suit: 'Motorsport suit',
  jersey: 'Jersey',
  top: 'Top',
  bottom: 'Bottom',
};

const SLEEVE_STYLE_LABELS: Record<SleeveStyle, string> = {
  sleeveless: 'Sleeveless (bare arms)',
  short_sleeve: 'Short sleeve',
  long_sleeve: 'Long sleeve',
};

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
  garmentType: GarmentType;
  sleeveStyle?: SleeveStyle | null;
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
      { label: 'Garment type', value: GARMENT_TYPE_LABELS[suit.garmentType] || suit.garmentType },
      ...(suit.sleeveStyle ? [{ label: 'Sleeve', value: SLEEVE_STYLE_LABELS[suit.sleeveStyle] }] : []),
      { label: 'Event allowlists', value: String(suit.eventAssignmentCount) },
      { label: 'Queue usage', value: String(suit.queueUsageCount) },
    ],
  }));
  // GDS AdminResourceCard renders every non-danger primary/secondary action with
  // the "edit" label, and ignores onPreview when a primary action exists. To avoid
  // multiple identical "Edit" buttons we keep no primary action (the garment image
  // opens via onPreview's Preview affordance) and a single 'edit' secondary.
  // WHAT: The former "Asset Builder" icon action is removed, not repointed.
  // WHY: It linked to /admin/tryon/analytics?garment=..., but the analytics page
  // has no garment filter at all — the param was silently dropped and the
  // operator landed on unfiltered global analytics under a label promising a
  // per-garment view. A dead affordance is worse than none; per-garment
  // analytics is roadmapped separately.
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedTryOnSuitRow>> = [
    {
      id: 'edit',
      label: 'Edit Garment',
      kind: 'secondary',
      onSelect: (suit) => {
        window.location.href = `/admin/tryon/suits/${suit.id}/edit`;
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
