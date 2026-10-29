'use client';

import { useState } from 'react';
import { InlineAlert, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import type { LibraryKind } from '@/lib/library/kinds';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';

/** Switch an own upload at its source level. The source active state applies to
 * every descendant; the confirmation makes that consequence explicit. */
export default function LibraryUploadActiveToggle({ level, ownerId, kind, id, itemActive, shareToChildren = false, disabled, onSaved }: {
  level: 'partner' | 'event';
  ownerId: string;
  kind: LibraryKind;
  id: string;
  itemActive: boolean;
  shareToChildren?: boolean;
  disabled?: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const language = useUiLanguage();
  const { confirm } = useGdsConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    const next = !itemActive;
    if (!next) {
      const message = level === 'partner' && shareToChildren
        ? adminOperationText('This asset will become unavailable to every child level. Existing selections are retained and become available again if sharing is restored.', language)
        : 'The asset will be unavailable in this event until it is switched on again. Existing selections will remain stored.';
      const accepted = await confirm({ title: 'Switch off this asset?', message, confirmAction: 'confirm' });
      if (!accepted) return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/${level === 'partner' ? 'partners' : 'events'}/${encodeURIComponent(ownerId)}/library/items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, isActive: next }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : adminOperationText('Could not update asset sharing.', language));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {error ? <InlineAlert title="Asset availability was not changed" message={error} severity="error" /> : null}
      <SemanticButton action={`library:${itemActive ? 'switch-off' : 'switch-on'}`} variant="secondary" size="xs" disabled={disabled || busy} loading={busy} onClick={() => void change()}>
        {itemActive ? 'Switch off' : 'Switch on'}
      </SemanticButton>
    </div>
  );
}
