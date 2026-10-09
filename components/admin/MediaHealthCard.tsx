'use client';

/**
 * The check of every photo's picture (lib/media/broken.ts; owner, 2026-10-09: a picture that is gone must be hidden everywhere, never shown as an error). One press asks the picture's own host
 * about each photo that has not been checked this week, 40 at a time, and shows what it finds; a photo whose picture is gone is marked and disappears from every screen, gallery, share page and
 * feed; nothing is deleted, and a picture that answers again is cleared at the next check. The work is POST /api/admin/media-health.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/gds/PublicPrimitives';
import { InlineAlert } from '@sovereignsquad/gds-core/client';

interface Status {
  unchecked: number;
  broken: number;
}

interface Batch {
  processed: number;
  counts: Partial<Record<'fine' | 'marked' | 'cleared' | 'unknown' | 'no-picture', number>>;
  next: string | null;
  remaining: number;
}

const URL_HEALTH = '/api/admin/media-health';

async function call<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(URL_HEALTH, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(typeof body?.error === 'string' && body.error ? body.error : `The request did not work (HTTP ${response.status})`);
  return body.data;
}

export default function MediaHealthCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState({ processed: 0, marked: 0, cleared: 0, unknown: 0 });
  const stop = useRef(false);

  useEffect(() => {
    call<Status>().then(setStatus, (e: unknown) => setError(e instanceof Error ? e.message : 'Could not read the count'));
  }, []);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setError(null);
    setTotals({ processed: 0, marked: 0, cleared: 0, unknown: 0 });
    let after: string | undefined;
    try {
      for (;;) {
        const batch = await call<Batch>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ after }) });
        setTotals((t) => ({ processed: t.processed + batch.processed, marked: t.marked + (batch.counts.marked ?? 0), cleared: t.cleared + (batch.counts.cleared ?? 0), unknown: t.unknown + (batch.counts.unknown ?? 0) }));
        setStatus((s) => ({ broken: (s?.broken ?? 0) + (batch.counts.marked ?? 0) - (batch.counts.cleared ?? 0), unchecked: batch.remaining }));
        if (!batch.next || stop.current) break;
        after = batch.next;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setRunning(false);
    }
  };

  const done = totals.processed > 0 && !running;
  return (
    <section aria-labelledby="media-health-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', marginBottom: '1rem', padding: '1rem 1.5rem' }}>
      <div>
        <h3 id="media-health-title" style={{ margin: 0 }}>
          Broken pictures
        </h3>
        <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
          A picture that its host no longer has is never shown: not on a screen, not in a gallery, not on the share page. This asks each picture&apos;s own host (one byte, nothing is downloaded) and hides the ones that are gone. Nothing is deleted, and a
          picture that answers again comes back at the next check.
        </p>
      </div>
      {error ? <InlineAlert title="Not done" message={error} severity="error" /> : null}
      {status ? (
        <span>
          {status.broken} {status.broken === 1 ? 'photo is' : 'photos are'} hidden because {status.broken === 1 ? 'its picture is' : 'their pictures are'} gone. {status.unchecked} {status.unchecked === 1 ? 'photo has' : 'photos have'} not been checked this week.
        </span>
      ) : null}
      {totals.processed > 0 ? (
        <span style={{ fontSize: '0.875rem' }}>
          {running ? 'Checking: ' : 'Done: '}
          {totals.processed} checked, {totals.marked} found gone and hidden, {totals.cleared} came back, {totals.unknown} could not be told (left as they were).
        </span>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <Button type="button" disabled={running || status === null || status.unchecked === 0} onClick={() => void run()}>
          {running ? 'Checking the pictures…' : done ? 'Check the rest again' : 'Check the pictures'}
        </Button>
        {running ? (
          <Button type="button" variant="light" onClick={() => (stop.current = true)}>
            Stop after this batch
          </Button>
        ) : null}
      </div>
    </section>
  );
}
