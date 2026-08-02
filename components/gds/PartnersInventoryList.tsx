'use client';

import Link from 'next/link';
import {
  AdminResourceEmptyState,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { ResourceListGrid } from '@/components/gds/ResourceListGrid';
import { getStatusChipContent } from '@/lib/gds/statusChipContent';

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
    status: getStatusChipContent({ tone: partner.isActive ? 'active' : 'inactive' }),
    metadata: [
      { label: 'Partner ID', value: partner.partnerId },
      { label: 'Events', value: String(partner.eventCount) },
      { label: 'Frames', value: String(partner.frameCount) },
      { label: 'Users', value: String(partner.userAccessCount) },
      { label: 'Created', value: partner.createdAtLabel },
    ],
  }));
  // Viewing goes through onPreview below rather than a second action, keeping
  // a single "Edit" button per card.
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
    <ResourceListGrid
      records={records}
      actions={actions}
      onPreview={(partner) => {
        window.location.href = `/admin/partners/${partner.id}`;
      }}
    />
  );
}
