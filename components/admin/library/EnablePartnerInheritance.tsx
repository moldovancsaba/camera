'use client';

import { useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';

export default function EnablePartnerInheritance({ partnerId, onSaved }: { partnerId: string; onSaved: () => void | Promise<void> }) {
  const language = useUiLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/partners/${encodeURIComponent(partnerId)}/library/policy`, { method: 'POST' });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? `Request failed (${response.status})`);
      await onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : adminOperationText('Could not update asset sharing.', language));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      {error ? <InlineAlert title={adminOperationText('Asset sharing was not changed', language)} message={error} severity="error" /> : null}
      <SemanticButton action="visual-assets:enable" variant="secondary" loading={busy} disabled={busy} onClick={() => void enable()}>
        {adminOperationText('Enable inherited catalog', language)}
      </SemanticButton>
    </div>
  );
}
