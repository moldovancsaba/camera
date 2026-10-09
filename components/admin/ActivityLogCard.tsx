'use client';

/**
 * The activity log (issue 517; lib/activity/*): what the people who manage the service did and every refused or failed request, who and when, mailed every Monday as a CSV to the owner. The card
 * says how many records wait for the next mail, how many are kept, when the last one was sent and to whom, and **Send now** does the weekly export at once (the same as the cron). The work is
 * GET and POST /api/admin/activity-log.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/gds/PublicPrimitives';
import { InlineAlert } from '@sovereignsquad/gds-core/client';

interface Status {
  waiting: number;
  kept: number;
  lastExport: { sentAt: string | null; toAt: string | null; rows: number } | null;
  to: string;
}

interface Sent {
  rows: number;
  deleted: number;
}

const URL_LOG = '/api/admin/activity-log';

async function call<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(URL_LOG, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(typeof body?.error === 'string' && body.error ? body.error : `The request did not work (HTTP ${response.status})`);
  return body.data;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never');

export default function ActivityLogCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);

  const load = useCallback(() => call<Status>().then(setStatus, (e: unknown) => setError(e instanceof Error ? e.message : 'Could not read the log')), []);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!status) return;
    setSending(true);
    setError(null);
    setSent(null);
    try {
      setSent(await call<Sent>({ method: 'POST' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="activity-log-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', padding: '1rem' }}>
      <div>
        <h3 id="activity-log-title" style={{ margin: 0 }}>
          Activity log
        </h3>
        <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
          Every change the people who manage the service make (who, when, what) and every refused or failed request, as a record with the person, the time, the address and the reason. No page view, no photo of a user, no text anybody typed.
          Every Monday the new records are mailed as a CSV, and the records the previous mail carried are deleted: a record is kept one to two weeks and always reaches the archive first.
        </p>
      </div>
      {error ? <InlineAlert title="Not done" message={error} severity="error" /> : null}
      {sent ? <InlineAlert title="Sent" message={`${sent.rows} record${sent.rows === 1 ? '' : 's'} mailed; ${sent.deleted} older record${sent.deleted === 1 ? '' : 's'} deleted.`} severity="info" /> : null}
      {status ? (
        <span>
          {status.waiting} record{status.waiting === 1 ? '' : 's'} wait for the next mail ({status.kept} kept in all). The last mail: {status.lastExport ? `${when(status.lastExport.sentAt)}, ${status.lastExport.rows} record${status.lastExport.rows === 1 ? '' : 's'}` : 'none yet'}. It goes to {status.to}.
        </span>
      ) : null}
      <div>
        <Button type="button" disabled={sending || status === null} onClick={() => void send()}>
          {sending ? 'Sending…' : 'Send now'}
        </Button>
      </div>
    </section>
  );
}
