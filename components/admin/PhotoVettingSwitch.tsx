'use client';

/**
 * The event's photo vetting setting (camera#268, docs/PHOTO_VETTING_PLAN.md). Shown to everyone who can review photos; only a global admin
 * gets the buttons (the API refuses anyone else). Turning vetting off publishes new photos without approval, so it asks first.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';

interface PhotoVettingSwitchProps {
  eventId: string;
  required: boolean;
  canChange: boolean;
}

export default function PhotoVettingSwitch({ eventId, required, canChange }: PhotoVettingSwitchProps) {
  const router = useRouter();
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoVetting: { required: next } }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : `Server error ${response.status}`);
      }
      setConfirmOff(false);
      router.refresh();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'The setting could not be changed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', padding: '1rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: '0.25rem' }}>
          <strong style={{ fontSize: '0.875rem' }} data-vetting-state={required ? 'on' : 'off'}>
            Photo vetting is {required ? 'on' : 'off'} for this event
          </strong>
          <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
            {required
              ? 'New photos wait here until an event manager approves them. The guest sees the shapes of the frame, and gets the link by email after approval.'
              : 'New photos are published at once, with the frame, as before.'}
          </p>
        </div>
        {canChange ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {required ? (
              confirmOff ? (
                <>
                  <SemanticButton action="photo-review:confirm-turn-off" type="button" variant="danger" onClick={() => void change(false)} disabled={busy}>
                    {busy ? 'Turning off…' : 'Confirm: publish new photos without approval'}
                  </SemanticButton>
                  <SemanticButton action="photo-review:cancel-turn-off" type="button" variant="secondary" onClick={() => setConfirmOff(false)} disabled={busy}>
                    Cancel
                  </SemanticButton>
                </>
              ) : (
                <SemanticButton action="photo-review:turn-off" type="button" variant="secondary" onClick={() => setConfirmOff(true)}>
                  Turn vetting off
                </SemanticButton>
              )
            ) : (
              <SemanticButton action="photo-review:turn-on" type="button" onClick={() => void change(true)} disabled={busy}>
                {busy ? 'Turning on…' : 'Turn vetting on'}
              </SemanticButton>
            )}
          </div>
        ) : null}
      </div>
      {error ? <InlineAlert title="Not changed" message={error} severity="error" /> : null}
    </section>
  );
}
