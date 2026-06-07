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

export interface SerializedLogoRow {
  id: string;
  logoId: string;
  name: string;
  description?: string | null;
  imageUrl: string;
  isActive: boolean;
  usageCount: number;
  partnerDefaultCount: number;
  eventAssignmentCount: number;
  primaryPartnerAdminId?: string | null;
  primaryPartnerName?: string | null;
  primaryEventAdminId?: string | null;
  primaryEventName?: string | null;
}

export default function LogosInventoryList({ logos }: { logos: SerializedLogoRow[] }) {
  const records: Array<AdminResourceRecord & SerializedLogoRow> = logos.map((logo) => ({
    ...logo,
    id: logo.id,
    title: logo.name,
    description: logo.description || 'Shared logo',
    mediaSrc: logo.imageUrl,
    mediaAlt: logo.name,
    status: <StatusBadge {...getStatusBadgeProps(logo.isActive ? 'active' : 'inactive')} />,
    metadata: [
      { label: 'Partner defaults', value: String(logo.partnerDefaultCount) },
      { label: 'Event assignments', value: String(logo.eventAssignmentCount) },
      { label: 'Usage', value: String(logo.usageCount) },
      logo.primaryPartnerName ? { label: 'Partner', value: logo.primaryPartnerName } : null,
      !logo.primaryPartnerName && logo.primaryEventName ? { label: 'Event', value: logo.primaryEventName } : null,
      !logo.primaryPartnerName && !logo.primaryEventName ? { label: 'Scope', value: 'Unassigned shared logo' } : null,
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
  }));
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedLogoRow>> = [
    {
      id: 'edit',
      label: 'Edit',
      kind: 'primary',
      onSelect: (logo) => {
        window.location.href = `/admin/logos/${logo.id}/edit`;
      },
    },
  ];

  if (logos.length === 0) {
    return (
      <AdminResourceEmptyState
          title="No logos yet"
          description="Upload your first shared logo to start assigning it across partners and apps."
          action={
            <Link href="/admin/logos/new">
              Upload Shared Logo
            </Link>
          }
        />
    );
  }

  return <AdminResourceManager records={records} state="ready" actions={actions} />;
}
