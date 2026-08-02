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

export interface SerializedPartnerRow {
  id: string;
  partnerId: string;
  name: string;
  description?: string | null;
  eventCount: number;
  frameCount: number;
  userAccessCount: number;
  createdAtLabel: string;
  isActive: boolean;
}

export default function PartnersInventoryList({ partners }: { partners: SerializedPartnerRow[] }) {
  const records: Array<AdminResourceRecord & SerializedPartnerRow> = partners.map((partner) => ({
    ...partner,
    id: partner.id,
    title: partner.name,
    description: partner.description || partner.partnerId,
    status: <StatusBadge {...getStatusBadgeProps(partner.isActive ? 'active' : 'inactive')} />,
    metadata: [
      { label: 'Partner ID', value: partner.partnerId },
      { label: 'Events', value: String(partner.eventCount) },
      { label: 'Frames', value: String(partner.frameCount) },
      { label: 'Users', value: String(partner.userAccessCount) },
      { label: 'Created', value: partner.createdAtLabel },
    ],
  }));
  // "View" is intentionally NOT a primary action: GDS AdminResourceCard forces
  // every non-danger primary/secondary action to the "edit" semantic, so a
  // primary 'view' rendered as a second button labelled "Edit" (both buttons
  // showing "Edit" side by side, one of them actually navigating to the view
  // page). Viewing is wired through onPreview below instead, leaving a single
  // correctly-labelled "Edit" secondary button. Same pattern as
  // EventsInventoryList.tsx.
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedPartnerRow>> = [
    {
      id: 'edit',
      label: 'Edit',
      kind: 'secondary',
      onSelect: (partner) => {
        window.location.href = `/admin/partners/${partner.id}/edit`;
      },
    },
  ];

  if (partners.length === 0) {
    return (
      <AdminResourceEmptyState
          title="No partners yet"
          description="Get started by adding your first partner workspace to Camera Core."
          action={
            <Link href="/admin/partners/new">
              Add Your First Partner
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
      onPreview={(partner) => {
        window.location.href = `/admin/partners/${partner.id}`;
      }}
    />
  );
}
