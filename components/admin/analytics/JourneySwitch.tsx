'use client';

/**
 * The kill switch of the journey recording (issue 521, phase 2; lib/journey/setting.ts), on the Journey tab of the Analytics view. Everyone who sees the tab sees whether the recording is on;
 * only a global admin gets the buttons (the API refuses anyone else). Switching it off stops the capture pages from sending anything and makes the beacon route write nothing, without a
 * deploy; it takes effect on every server within 30 seconds. It asks first, in the page (never the browser's own confirm box).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { formatDateTime } from '@/lib/analytics/format';

interface JourneySwitchProps {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
  canChange: boolean;
  timeZone: string;
}

export default function JourneySwitch({ enabled, updatedAt, updatedBy, canChange, timeZone }: JourneySwitchProps) {
  const router = useRouter();
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/settings/journey-recording', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : `Server error ${response.status}`);
      setConfirmOff(false);
      router.refresh();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'The setting could not be changed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-journey-switch={enabled ? 'on' : 'off'} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', padding: '1rem' }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: '0.25rem', minWidth: 0 }}>
          <strong style={{ fontSize: '0.875rem' }}>The journey recording is {enabled ? 'on' : 'off'} for every event</strong>
          <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
            {enabled
              ? 'The capture pages send an anonymous record of each step (no IP address, no device string, no name, no e-mail). Switching it off stops that everywhere, without a deploy.'
              : 'The capture pages send nothing and the server writes nothing. The figures below stop growing; what was recorded before stays.'}
            {updatedAt ? ` Last changed ${formatDateTime(updatedAt, timeZone)}${updatedBy ? ` by ${updatedBy}` : ''}.` : ' Never changed: it is on as it is by default.'}
          </p>
        </div>
        {canChange ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {enabled ? (
              confirmOff ? (
                <>
                  <SemanticButton action="journey-recording:confirm-switch-off" type="button" variant="danger" onClick={() => void change(false)} disabled={busy}>
                    Confirm: switch it off
                  </SemanticButton>
                  <SemanticButton action="journey-recording:cancel" type="button" variant="secondary" onClick={() => setConfirmOff(false)} disabled={busy}>
                    Cancel
                  </SemanticButton>
                </>
              ) : (
                <SemanticButton action="journey-recording:switch-off" type="button" variant="secondary" onClick={() => setConfirmOff(true)}>
                  Switch the recording off
                </SemanticButton>
              )
            ) : (
              <SemanticButton action="journey-recording:switch-on" type="button" onClick={() => void change(true)} disabled={busy}>
                Switch the recording on
              </SemanticButton>
            )}
          </div>
        ) : null}
      </div>
      {error ? <InlineAlert title="Not changed" message={error} severity="error" /> : null}
    </section>
  );
}
