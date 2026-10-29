'use client';

import { useState } from 'react';
import { InlineAlert, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import type { LibraryKind, LibraryScope } from '@/lib/library/kinds';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';

interface Props {
  level: 'partner' | 'event';
  ownerId: string;
  kind: LibraryKind;
  id: string;
  scope: LibraryScope;
  hidden?: boolean;
  blockedForChildren?: boolean;
  shareToChildren?: boolean;
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}

/** GDS actions for the two independent child-level decisions: local visibility
 * and permission to forward an item to the next level. */
export default function VisualAssetPolicyActions({ level, ownerId, kind, id, scope, hidden = false, blockedForChildren = false, shareToChildren = true, disabled = false, onSaved }: Props) {
  const language = useUiLanguage();
  const { confirm } = useGdsConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (action: string) => {
    const isPartnerOwnerSharing = level === 'partner' && scope === 'partner';
    const stopsAtParent = isPartnerOwnerSharing && shareToChildren;
    const hidesDescendants = level === 'partner' && scope === 'global' && (action === 'hide' || action === 'stop-forwarding');
    if (stopsAtParent || hidesDescendants) {
      const confirmed = await confirm({
        title: adminOperationText('Stop sharing with child levels', language),
        message: adminOperationText('This asset will become unavailable to child levels immediately. Existing selections are retained and become available again if the parent makes it available.', language),
        confirmAction: 'confirm',
      });
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(isPartnerOwnerSharing
        ? `/api/visual-assets/${kind}/${encodeURIComponent(id)}/sharing`
        : level === 'partner' ? `/api/partners/${encodeURIComponent(ownerId)}/library/policy` : `/api/events/${encodeURIComponent(ownerId)}/library/policy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPartnerOwnerSharing
          ? { shareToChildren: !shareToChildren }
          : level === 'partner' ? { kind, id, action } : { kind, id, hidden: action === 'hide' }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update asset sharing.');
    } finally {
      setBusy(false);
    }
  };

  const actions = level === 'event'
    ? [hidden ? { action: 'show', label: 'Show at this level' } : { action: 'hide', label: 'Hide from this level' }]
    : scope === 'partner'
      ? [{ action: shareToChildren ? 'stop-sharing-to-children' : 'share-to-children', label: shareToChildren ? 'Stop sharing with events' : 'Share with events' }]
      : [
          { action: hidden ? 'show' : 'hide', label: hidden ? 'Show at this level' : 'Hide from this level' },
          { action: blockedForChildren ? 'allow-forwarding' : 'stop-forwarding', label: blockedForChildren ? 'Share with events' : 'Stop sharing with events' },
        ];

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {error ? <InlineAlert title="Asset sharing was not changed" message={error} severity="error" /> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {actions.map(({ action, label }) => (
          <SemanticButton key={action} action={`visual-assets:${action}`} variant="secondary" size="xs" disabled={disabled || busy} loading={busy} onClick={() => void change(action)}>
            {adminOperationText(label, language)}
          </SemanticButton>
        ))}
      </div>
    </div>
  );
}
