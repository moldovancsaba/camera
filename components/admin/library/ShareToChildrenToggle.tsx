'use client';

import { useState } from 'react';
import { InlineAlert, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import type { LibraryKind } from '@/lib/library/kinds';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';

export default function ShareToChildrenToggle({ kind, id, shareToChildren = true, childAudience = 'partners', disabled = false, onSaved }: {
  kind: LibraryKind;
  id: string;
  shareToChildren?: boolean;
  /** Global assets are shared with partner workspaces; partner assets with events. */
  childAudience?: 'partners' | 'events';
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const language = useUiLanguage();
  const { confirm } = useGdsConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = !shareToChildren;
  const stopSharingText = childAudience === 'events' ? 'Stop sharing with events' : 'Stop sharing with partners';
  const startSharingText = childAudience === 'events' ? 'Share with events' : 'Share with partners';

  const change = async () => {
    if (!next) {
      const confirmed = await confirm({
        title: adminOperationText(stopSharingText, language),
        message: adminOperationText('This asset will become unavailable to every child level. Existing selections are retained and become available again if sharing is restored.', language),
        confirmAction: 'confirm',
      });
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/visual-assets/${kind}/${encodeURIComponent(id)}/sharing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareToChildren: next }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update sharing.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {error ? <InlineAlert title="Sharing was not changed" message={error} severity="error" /> : null}
      <SemanticButton action={`visual-assets:${next ? 'share-to-children' : 'stop-sharing-to-children'}`} variant="secondary" size="xs" disabled={disabled || busy} loading={busy} onClick={() => void change()}>
        {adminOperationText(next ? startSharingText : stopSharingText, language)}
      </SemanticButton>
    </div>
  );
}
