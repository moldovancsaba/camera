'use client';

/**
 * Makes the screen-sized pictures of the photos that already exist (issue 476, step S7; owner answers 211 b and 219 b). One press walks all photos of the slideshow events in batches of
 * 24 and shows how it goes; it can be stopped and pressed again (a photo that has a screen picture is skipped). The work is done by POST /api/admin/screen-pictures/backfill.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/gds/PublicPrimitives';
import { InlineAlert } from '@sovereignsquad/gds-core/client';

interface Status {
  remaining: number;
  events: number;
}

interface Batch {
  processed: number;
  counts: Partial<Record<'made' | 'reused-original' | 'exists' | 'no-source' | 'failed', number>>;
  beforeBytes: number;
  afterBytes: number;
  next: string | null;
  remaining: number;
}

const URL_BACKFILL = '/api/admin/screen-pictures/backfill';
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

async function call<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(URL_BACKFILL, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(body?.error || 'The request did not work');
  return body.data;
}

export default function ScreenPicturesCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState({ processed: 0, made: 0, reused: 0, failed: 0, before: 0, after: 0 });
  const stop = useRef(false);

  useEffect(() => {
    call<Status>().then(setStatus, (e: unknown) => setError(e instanceof Error ? e.message : 'Could not read the count'));
  }, []);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setError(null);
    setTotals({ processed: 0, made: 0, reused: 0, failed: 0, before: 0, after: 0 });
    let after: string | undefined;
    try {
      for (;;) {
        const batch = await call<Batch>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ after }) });
        setTotals((t) => ({
          processed: t.processed + batch.processed,
          made: t.made + (batch.counts.made ?? 0),
          reused: t.reused + (batch.counts['reused-original'] ?? 0),
          failed: t.failed + (batch.counts.failed ?? 0),
          before: t.before + batch.beforeBytes,
          after: t.after + batch.afterBytes,
        }));
        setStatus((s) => ({ events: s?.events ?? 0, remaining: batch.remaining }));
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
    <section aria-labelledby="screen-pictures-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', marginBottom: '1rem', padding: '1rem 1.5rem' }}>
      <div>
        <h3 id="screen-pictures-title" style={{ margin: 0 }}>
          Screen-sized pictures
        </h3>
        <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
          The giant screen is sent a lighter picture of each photo (at most 1920 px, WebP). New photos get one when they are approved. This makes them for the photos that already exist on events with a slideshow: it only adds a
          picture next to each photo and never changes or deletes an original, and it can be repeated safely.
        </p>
      </div>
      {error ? <InlineAlert title="Not done" message={error} severity="error" /> : null}
      {status ? (
        <span>
          {status.remaining === 0 ? 'Every photo on the slideshow events has its screen picture.' : `${status.remaining} photo${status.remaining === 1 ? '' : 's'} on ${status.events} slideshow event${status.events === 1 ? '' : 's'} still use the full-size picture.`}
        </span>
      ) : null}
      {totals.processed > 0 ? (
        <span style={{ fontSize: '0.875rem' }}>
          {running ? 'Working: ' : 'Done: '}
          {totals.processed} looked at, {totals.made} new pictures made, {totals.reused} already small enough, {totals.failed} could not be made. {totals.before > 0 ? `${mb(totals.before)} became ${mb(totals.after)}.` : ''}
        </span>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <Button type="button" disabled={running || status === null || status.remaining === 0} onClick={() => void run()}>
          {running ? 'Making the pictures…' : done ? 'Make the rest again' : 'Make the screen pictures'}
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
