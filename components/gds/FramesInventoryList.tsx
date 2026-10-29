'use client';

import Link from 'next/link';
import {
  AdminResourceEmptyState,
  AdminResourceManager,
  type AdminResourceAction,
  type AdminResourceRecord,
} from '@sovereignsquad/gds-admin/client';
import { getStatusChipContent } from '@/lib/gds/statusChipContent';
import { useState } from 'react';
import { InlineAlert, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';

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
  shareToChildren?: boolean;
}

export default function FramesInventoryList({ frames }: { frames: SerializedFrameRow[] }) {
  const language = useUiLanguage();
  const { confirm } = useGdsConfirm();
  const [actionError, setActionError] = useState<string | null>(null);
  const records: Array<AdminResourceRecord & SerializedFrameRow> = frames.map((frame) => ({
    ...frame,
    id: frame.id,
    title: frame.name,
    description: frame.description || frame.category || 'Shared frame',
    mediaSrc: frame.imageUrl,
    mediaAlt: frame.name,
    status: getStatusChipContent(
      {
        tone: frame.scope === 'event' ? 'active' : frame.scope === 'partner' ? 'info' : 'inactive',
        label: frame.scope === 'global' ? 'Global' : frame.scope === 'partner' ? 'Partner' : 'Event',
      },
      { tone: frame.isActive ? 'active' : 'inactive' }
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
      id: 'share-global',
      label: adminOperationText('Share with partners', language),
      kind: 'secondary',
      disabled: (frame) => frame.scope !== 'global' || frame.shareToChildren !== false,
      onSelect: (frame) => void updateSharing(frame.id, true),
    },
    {
      id: 'stop-share-global',
      label: adminOperationText('Stop sharing with partners', language),
      kind: 'secondary',
      disabled: (frame) => frame.scope !== 'global' || frame.shareToChildren === false,
      onSelect: (frame) => void confirmStopSharing(frame.id),
    },
    {
      id: 'edit',
      label: 'Edit',
      kind: 'primary',
      onSelect: (frame) => {
        window.location.href = `/admin/frames/${frame.id}/edit`;
      },
    },
  ];

  async function confirmStopSharing(id: string) {
    const confirmed = await confirm({
      title: adminOperationText('Stop sharing with child levels', language),
      message: adminOperationText('This asset will become unavailable to every child level. Existing selections are retained and become available again if sharing is restored.', language),
      confirmAction: 'confirm',
    });
    if (confirmed) await updateSharing(id, false);
  }

  async function updateSharing(id: string, shareToChildren: boolean) {
    setActionError(null);
    try {
      const response = await fetch(`/api/visual-assets/frames/${encodeURIComponent(id)}/sharing`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shareToChildren }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
      window.location.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : adminOperationText('Could not update asset sharing.', language));
    }
  }

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

  return <>
    {actionError ? <InlineAlert title={adminOperationText('Asset sharing was not changed', language)} message={actionError} severity="error" /> : null}
    <AdminResourceManager records={records} state="ready" actions={actions} />
  </>;
}
