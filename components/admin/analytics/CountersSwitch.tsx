'use client';

/**
 * The switch of the counters for messmass (issue 628; lib/analytics/counters-setting.ts), on the Messmass tab of the Analytics view, which only global admins see. It shows whether camera sends
 * the counters of the events that are linked to messmass, who last changed it and when, and changes it through PATCH /api/admin/settings/messmass-counters. **Switching on asks first, in the page**
 * (never the browser's own confirm box), because real numbers then go to messmass; switching off is at once. The switch pushes nothing itself: the first push happens after the next vetting
 * decision or relevant Journey update for an event that is linked to messmass.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { formatDateTime } from '@/lib/analytics/format';

interface CountersSwitchProps {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
  timeZone: string;
}

export default function CountersSwitch({ enabled, updatedAt, updatedBy, timeZone }: CountersSwitchProps) {
  const router = useRouter();
  const [confirmOn, setConfirmOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/settings/messmass-counters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : `Server error ${response.status}`);
      setConfirmOn(false);
      router.refresh();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'The setting could not be changed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-counters-switch={enabled ? 'on' : 'off'} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', padding: '1rem' }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: '0.25rem', minWidth: 0 }}>
          <strong style={{ fontSize: '0.875rem' }}>Sending to messmass is {enabled ? 'on' : 'off'} for every event that is linked to messmass</strong>
          <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
            {enabled
              ? 'After a vetting decision and after the people of a photo are saved, camera sends the counters of that event to messmass. Switching it off stops that at once; what messmass already holds stays there.'
              : 'Camera sends nothing to messmass and reads nothing for it. The numbers below are only a preview.'}
            {updatedAt ? ` Last changed ${formatDateTime(updatedAt, timeZone)}${updatedBy ? ` by ${updatedBy}` : ''}.` : ' Never changed: it is off, as it is by default.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {enabled ? (
            <SemanticButton action="messmass-counters:switch-off" type="button" variant="outline" onClick={() => void change(false)} disabled={busy}>
              Switch sending off
            </SemanticButton>
          ) : confirmOn ? (
            <>
              <SemanticButton action="messmass-counters:confirm-switch-on" type="button" color="green.8" onClick={() => void change(true)} disabled={busy}>
                Confirm: switch sending on
              </SemanticButton>
              <SemanticButton action="messmass-counters:cancel" type="button" variant="outline" onClick={() => setConfirmOn(false)} disabled={busy}>
                Cancel
              </SemanticButton>
            </>
          ) : (
            <SemanticButton action="messmass-counters:switch-on" type="button" onClick={() => setConfirmOn(true)}>
              Switch sending on
            </SemanticButton>
          )}
        </div>
      </div>
      {confirmOn && !enabled ? (
        <InlineAlert
          title="Real numbers will go to messmass"
          message="From the next submission, vetting decision, or Journey update, aggregate operational counters for linked events are written into that event's Messmass statistics under names that start with camera_. Per-photo image analysis is delivered separately by Fanmass. Switch it on only after reviewing the preview below. You can switch it off here at any time."
          severity="warning"
        />
      ) : null}
      {error ? <InlineAlert title="Not changed" message={error} severity="error" /> : null}
    </section>
  );
}
