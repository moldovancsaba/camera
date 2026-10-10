'use client';

/**
 * The follow-up e-mail by hand (epic 463, issue 559, lib/email/follow-up.ts; global admins): the e-mail a week after the event goes out by the daily job once CRON_SECRET is set on the project
 * (issue 529); until then, and whenever somebody wants to see what it would do, this card runs the same job. **Count (dry run)** reads the events, photos and claims and writes and sends nothing;
 * **Send now** (only after a count, and only after a second press that says how many) sends the e-mails that are due, at most a limited number per press. The work is GET and POST
 * /api/admin/follow-up-emails. The result is a few lines and one block for each event, so it fits a phone.
 */

import { useCallback, useEffect, useState } from 'react';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import { Button, Group } from '@/components/gds/PublicPrimitives';
import type { FollowUpResult } from '@/lib/email/follow-up';

interface Status {
  cronConfigured: boolean;
  minAgeDays: number;
  maxAgeDays: number;
  maxSendsPerRun: number;
}

const URL_RUN = '/api/admin/follow-up-emails';

async function call<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(URL_RUN, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(typeof body?.error === 'string' && body.error ? body.error : `The request did not work (HTTP ${response.status})`);
  return body.data;
}

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Summary({ result }: { result: FollowUpResult }) {
  const lines: string[] = [];
  if (result.eventsOn === 0) lines.push(`No event has the follow-up e-mail on and a date between ${result.maxAgeDays} and 7 days ago (today is ${result.today}).`);
  else lines.push(`${plural(result.eventsOn, 'event')} ${result.eventsOn === 1 ? 'has' : 'have'} it on and ${result.eventsOn === 1 ? 'is' : 'are'} due today (today is ${result.today}).`);
  if (result.eventsOnWithoutDate > 0) lines.push(`${plural(result.eventsOnWithoutDate, 'event')} ${result.eventsOnWithoutDate === 1 ? 'has' : 'have'} it on but no date, so nothing is sent for ${result.eventsOnWithoutDate === 1 ? 'it' : 'them'}.`);
  if (result.eventsOn > 0) {
    lines.push(`${plural(result.eligible, 'user')} with an e-mail address, an approved photo and agreement to the terms.`);
    lines.push(result.dryRun ? `${plural(result.toSend, 'e-mail')} to send now.` : `${plural(result.sent, 'e-mail')} sent, ${result.failed} failed, ${result.remaining} left for the next press or run.`);
    const skipped = [
      result.alreadySent > 0 ? `${result.alreadySent} already sent` : '',
      result.held > 0 ? `${result.held} held (a run stopped before the answer; never sent twice)` : '',
      result.gaveUp > 0 ? `${result.gaveUp} given up after repeated failures` : '',
      result.withoutConsent > 0 ? `${result.withoutConsent} did not agree to the terms` : '',
      result.photosWithoutAddress > 0 ? `${plural(result.photosWithoutAddress, 'photo')} without an e-mail address` : '',
    ].filter(Boolean);
    if (skipped.length > 0) lines.push(`Not sent: ${skipped.join('; ')}.`);
  }
  return (
    <div style={{ display: 'grid', gap: '0.5rem' }} data-follow-up-result>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
      {result.events.map((event) => (
        <div key={event.eventId} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', display: 'grid', gap: '0.25rem', padding: '0.5rem 0.75rem', overflowWrap: 'anywhere' }}>
          <strong>{event.name || event.eventId}</strong>
          <span style={muted}>
            Event day {event.day}. {plural(event.eligible, 'user')}; {result.dryRun ? `${event.toSend} to send` : `${event.sent} sent, ${event.failed} failed`}; {event.alreadySent} already sent
            {event.held ? `; ${event.held} held` : ''}
            {event.gaveUp ? `; ${event.gaveUp} given up` : ''}
            {event.withoutConsent ? `; ${event.withoutConsent} without agreement` : ''}.
          </span>
        </div>
      ))}
    </div>
  );
}

export default function FollowUpEmailsCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'count' | 'send' | null>(null);
  const [result, setResult] = useState<FollowUpResult | null>(null);
  const [counted, setCounted] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => call<Status>().then(setStatus, (e: unknown) => setError(e instanceof Error ? e.message : 'Could not read the settings')), []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? 'count' : 'send');
    setError(null);
    setConfirming(false);
    try {
      const next = await call<FollowUpResult>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun }) });
      setResult(next);
      // A count says how many a send has to do; after a send the number to confirm again is what is left.
      setCounted(dryRun ? next.toSend : next.remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="follow-up-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', padding: '1rem' }}>
      <div>
        <h3 id="follow-up-title" style={{ margin: 0 }}>
          Follow-up e-mails
        </h3>
        <p style={{ ...muted, margin: '0.25rem 0 0' }}>
          A week after the event each user who has an approved photo, gave an e-mail address and agreed to the terms gets one e-mail to look back at the memory, once. Only events that have it switched on (in their Emails page, or by their partner) and have a date send it.
          Nothing is on until somebody switches it on. A count changes and sends nothing.
        </p>
      </div>
      {status ? (
        <span style={muted}>
          {status.cronConfigured ? 'The daily job runs by itself.' : 'The daily job cannot run by itself yet: CRON_SECRET is not set on the Vercel project (issue 529). Until then it only runs when you press a button here.'} It sends from day {status.minAgeDays} after
          the event until day {status.maxAgeDays}, and at most {status.maxSendsPerRun} e-mails per run.
        </span>
      ) : null}
      {error ? <InlineAlert title="Not done" message={error} severity="error" /> : null}
      <Group gap="xs" wrap="wrap">
        <Button type="button" variant="light" loading={busy === 'count'} disabled={busy !== null} onClick={() => void run(true)}>
          Count what would be sent (dry run)
        </Button>
        <Button type="button" disabled={busy !== null || counted === null || counted === 0 || confirming} onClick={() => setConfirming(true)}>
          Send now
        </Button>
      </Group>
      {confirming ? (
        <InlineAlert title="Send now?" message={`${plural(counted ?? 0, 'e-mail')} will be sent to real people, at most ${status?.maxSendsPerRun ?? 120} in this press. This cannot be undone.`} severity="warning" />
      ) : null}
      {confirming ? (
        <Group gap="xs" wrap="wrap">
          <Button type="button" color="red" loading={busy === 'send'} disabled={busy !== null} onClick={() => void run(false)}>
            Yes, send
          </Button>
          <Button type="button" variant="light" disabled={busy !== null} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </Group>
      ) : null}
      {result ? <Summary result={result} /> : null}
    </section>
  );
}
