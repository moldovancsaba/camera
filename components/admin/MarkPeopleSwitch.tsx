'use client';

/**
 * The event's setting for marking before a vetting decision (issue 542, lib/photo-vetting/people.ts): it controls whether analysis blocks approve/reject, not whether analysis is done eventually.
 * When off, eligible photos stay in the separate Photo analysis queue. Shown to event managers; only a global admin gets the setting button.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';

export default function MarkPeopleSwitch({ eventId, on, canChange, vettingRequired }: { eventId: string; on: boolean; canChange: boolean; vettingRequired: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markPeopleInVetting: next }) });
      const data = (await response.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : `Server error ${response.status}`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The setting could not be changed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', padding: '1rem' }}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'grid', gap: '0.25rem' }}>
          <strong style={{ fontSize: '0.875rem' }} data-mark-people-state={on ? 'on' : 'off'}>
            Analysis before a vetting decision is {on ? 'required' : 'not required'}
          </strong>
          <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
            {!vettingRequired
              ? 'Vetting is off, so this setting does not block publication. All eligible photos can be analysed later on the Photo analysis page.'
              : on
                ? 'Before approving or rejecting, the reviewer marks each person (gender and age, with optional details) or chooses Nobody in this photo. Completed photos leave the analysis queue.'
                : 'Vetting can approve or reject photos immediately. Unanalysed photos remain in Photo analysis for later; turning this off never skips analysis.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {canChange ? (
            <SemanticButton action={on ? 'photo-review:mark-turn-off' : 'photo-review:mark-turn-on'} type="button" variant="secondary" disabled={busy} onClick={() => void change(!on)}>
              {busy ? 'Saving…' : on ? 'Allow vetting before analysis' : 'Require analysis before decision'}
            </SemanticButton>
          ) : null}
        </div>
      </div>
      {error ? <InlineAlert title="Not changed" message={error} severity="error" /> : null}
    </section>
  );
}
