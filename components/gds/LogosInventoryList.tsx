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
  /** Who owns the logo (camera#361): the global library, one partner, or one event; its name for a partner or an event. */
  scope?: 'global' | 'partner' | 'event';
  ownerName?: string | null;
  /** `messmass` for a partner's logo imported from messmass (camera#367). */
  source?: string | null;
  shareToChildren?: boolean;
}

const OWNER_LABEL = { global: 'Global', partner: 'Partner', event: 'Event' } as const;

export default function LogosInventoryList({ logos }: { logos: SerializedLogoRow[] }) {
  const language = useUiLanguage();
  const { confirm } = useGdsConfirm();
  const [actionError, setActionError] = useState<string | null>(null);
  const records: Array<AdminResourceRecord & SerializedLogoRow> = logos.map((logo) => ({
    ...logo,
    id: logo.id,
    title: logo.name,
    description: logo.description || 'Shared logo',
    mediaSrc: logo.imageUrl,
    mediaAlt: logo.name,
    status:
      logo.scope && logo.scope !== 'global'
        ? getStatusChipContent(
            { tone: logo.scope === 'event' ? 'active' : 'info', label: logo.source === 'messmass' ? 'Partner, from messmass' : OWNER_LABEL[logo.scope] },
            { tone: logo.isActive ? 'active' : 'inactive' }
          )
        : getStatusChipContent({ tone: logo.isActive ? 'active' : 'inactive' }),
    metadata: [
      logo.scope && logo.scope !== 'global' ? { label: OWNER_LABEL[logo.scope], value: logo.ownerName || 'Unknown' } : null,
      { label: 'Partner defaults', value: String(logo.partnerDefaultCount) },
      { label: 'Event assignments', value: String(logo.eventAssignmentCount) },
      { label: 'Usage', value: String(logo.usageCount) },
      logo.primaryPartnerName ? { label: 'Partner', value: logo.primaryPartnerName } : null,
      !logo.primaryPartnerName && logo.primaryEventName ? { label: 'Event', value: logo.primaryEventName } : null,
      !logo.primaryPartnerName && !logo.primaryEventName && (!logo.scope || logo.scope === 'global') ? { label: 'Scope', value: 'Unassigned shared logo' } : null,
    ].filter((item): item is { label: string; value: string } => Boolean(item)),
  }));
  const actions: Array<AdminResourceAction<AdminResourceRecord & SerializedLogoRow>> = [
    {
      id: 'toggle-global-sharing',
      label: adminOperationText('Toggle sharing with partners', language),
      // GDS maps secondary card actions to its generic Edit slot; the labeled icon avoids duplicate, misleading Edit buttons.
      kind: 'icon',
      disabled: (logo) => logo.scope !== 'global',
      onSelect: (logo) => {
        if (logo.shareToChildren === false) void updateSharing(logo.logoId, true);
        else void confirmStopSharing(logo.logoId);
      },
    },
    {
      id: 'edit',
      label: 'Edit',
      kind: 'primary',
      onSelect: (logo) => {
        window.location.href = `/admin/logos/${logo.id}/edit`;
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
      const response = await fetch(`/api/visual-assets/logos/${encodeURIComponent(id)}/sharing`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shareToChildren }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
      window.location.reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : adminOperationText('Could not update asset sharing.', language));
    }
  }

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

  return <>
    {actionError ? <InlineAlert title={adminOperationText('Asset sharing was not changed', language)} message={actionError} severity="error" /> : null}
    <AdminResourceManager records={records} state="ready" actions={actions} />
  </>;
}
