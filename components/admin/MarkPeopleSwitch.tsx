'use client';

/**
 * The event's setting "mark the people at vetting" (issue 542, lib/photo-vetting/people.ts): when on, the big vetting view asks the reviewer to mark the people in each photo before approving
 * or rejecting it. Off by default: the vetting is as it was. Shown to everyone who can review photos; only a global admin gets the buttons (the API refuses anyone else).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';

export default function MarkPeopleSwitch({ eventId, on, canChange, waiting }: { eventId: string; on: boolean; canChange: boolean; waiting: number }) {
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
            Marking the people is {on ? 'on' : 'off'} for this event
          </strong>
          <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
            {on
              ? 'In Review one by one the reviewer marks each person with a rectangle and 16 buttons (who, emotion, merchandise), or says Nobody in this photo, before approving or rejecting. It is saved with the photo for the analytics. The Approve buttons on the cards below decide without marking: use Review one by one.'
              : 'The big view is only the photo and the decision. Switch marking on to mark the people in each photo for the analytics.'}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Link href={`/admin/events/${eventId}/vetting/review`} style={{ textDecoration: 'none' }}>
            <SemanticButton action="photo-review:review-one-by-one" type="button" variant="secondary" disabled={waiting === 0}>
              Review one by one
            </SemanticButton>
          </Link>
          {canChange ? (
            <SemanticButton action={on ? 'photo-review:mark-turn-off' : 'photo-review:mark-turn-on'} type="button" variant="secondary" disabled={busy} onClick={() => void change(!on)}>
              {busy ? 'Saving…' : on ? 'Turn marking off' : 'Turn marking on'}
            </SemanticButton>
          ) : null}
        </div>
      </div>
      {error ? <InlineAlert title="Not changed" message={error} severity="error" /> : null}
    </section>
  );
}
