'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';
import { getStatusChipContent } from '@/lib/gds/statusChipContent';

export interface SerializedTryOnSetupRow {
  id: string;
  setupId: string;
  name: string;
  description?: string | null;
  cameraId?: string | null;
  isActive: boolean;
  isDefault: boolean;
  profile?: string | null;
  category?: string | null;
  defaultForGarmentTypes?: string[] | null;
}

export default function TryOnSetupsInventoryList({ setups }: { setups: SerializedTryOnSetupRow[] }) {
  const router = useRouter();
  const { confirm } = useGdsConfirm();
  const { notifySuccess, notifyError } = useGdsToasts();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(setup: SerializedTryOnSetupRow) {
    const nextActive = !setup.isActive;
    const confirmed = await confirm({
      title: nextActive ? 'Unarchive setup' : 'Archive setup',
      message: nextActive
        ? `"${setup.name}" becomes available for rerun and job resolution again.`
        : `"${setup.name}" stops appearing in rerun/job-resolution pickers. It is not deleted -- unarchive any time.`,
    });
    if (!confirmed) return;

    setBusyId(setup.id);
    try {
      const response = await fetch(`/api/admin/tryon-setups/${setup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update setup');
      }
      notifySuccess({ title: nextActive ? 'Unarchived' : 'Archived', message: `"${setup.name}" ${nextActive ? 'is active again' : 'is archived'}.` });
      router.refresh();
    } catch (error) {
      notifyError({ title: 'Update failed', message: error instanceof Error ? error.message : 'Failed to update setup' });
    } finally {
      setBusyId(null);
    }
  }

  const records: Array<AdminResourceRecord & SerializedTryOnSetupRow> = setups.map((setup) => ({
    ...setup,
    id: setup.id,
    title: setup.name,
    description: setup.description || setup.setupId,
    status: getStatusChipContent({ tone: setup.isActive ? 'active' : 'inactive' }),
    metadata: [
      { label: 'Setup ID', value: setup.setupId },
      ...(setup.isDefault ? [{ label: 'Default', value: setup.cameraId ? `Yes (camera ${setup.cameraId})` : 'Yes (global)' }] : []),
      ...(setup.profile ? [{ label: 'Processing profile', value: setup.profile }] : []),
      ...(setup.category ? [{ label: 'Category', value: setup.category }] : []),
      ...(setup.defaultForGarmentTypes?.length
        ? [{ label: 'Default for garments', value: setup.defaultForGarmentTypes.join(', ') }]
        : []),
    ],
  }));

  // Same GDS constraint noted in TryOnSuitsInventoryList: non-danger actions
  // all render labeled "Edit", so Archive/Unarchive is the 'danger' kind
  // (exempt from that relabeling) and Duplicate lives on the edit page
  // instead of fighting for a second secondary-action slot here.
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedTryOnSetupRow>> = [
    {
      id: 'edit',
      label: 'Edit Setup',
      kind: 'secondary',
      onSelect: (setup) => {
        window.location.href = `/admin/tryon/setups/${setup.id}/edit`;
      },
    },
    {
      id: 'toggle-active',
      label: 'Archive / Unarchive',
      kind: 'danger',
      disabled: (setup) => busyId === setup.id,
      onSelect: (setup) => void toggleActive(setup),
    },
  ];

  if (setups.length === 0) {
    return (
      <AdminResourceEmptyState
        title="No try-on setups yet"
        description="Create the first processing preset so try-on jobs have something to resolve to."
        action={<Link href="/admin/tryon/setups/new">Create First Setup</Link>}
      />
    );
  }

  return <AdminResourceManager records={records} state="ready" actions={actions} hideWhenNoMedia />;
}
