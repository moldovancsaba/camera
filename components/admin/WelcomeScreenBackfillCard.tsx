'use client';

/**
 * The default slideshow and the welcome page screen picture for the events that already exist (issue 326, issue 327; owner question 180; lib/screen/welcome-backfill.ts; global admins). Only a new
 * event gets them by itself, so every event that was made before has neither until somebody runs this.
 *
 * **Count (dry run)** reads the events and writes nothing: it lists the events that have no picture yet and says for each what the users of the event would see differently afterwards (a default
 * welcome page as their first page, the drawn picture on their welcome page, or nothing). **Nothing is selected**: the person who runs it chooses the events, with shortcuts for the upcoming ones and
 * the ones with no visible change. **Make for N events** (only after a count and a choice) asks again in the page, with the number and how many events will show their users something new; only then
 * it works on the chosen events, a few per call, and can be stopped. It only adds (a tracked link, a slideshow, a picture); nothing is deleted and no page is changed; running it again skips what is done.
 * The work is GET and POST /api/admin/welcome-screen-backfill.
 */

import { useRef, useState } from 'react';
import { InlineAlert, LabelTag } from '@sovereignsquad/gds-core/client';
import VisibilityStatusIcon from '@/components/gds/VisibilityStatusIcon';
import { Button, Checkbox, Group } from '@/components/gds/PublicPrimitives';
import type { BackfillChange, BackfillPlan, BackfillResult, BackfillRow, BackfillRun } from '@/lib/screen/welcome-backfill';

const URL_BACKFILL = '/api/admin/welcome-screen-backfill';

async function call<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(URL_BACKFILL, init);
  const body = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !body?.data) throw new Error(typeof body?.error === 'string' && body.error ? body.error : `The request did not work (HTTP ${response.status})`);
  return body.data;
}

const muted = { color: 'var(--mantine-color-dimmed)', fontSize: '0.8125rem' } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const CHANGE_LABEL: Record<BackfillChange, { tone: 'info' | 'warning' | 'neutral'; label: string; help: string }> = {
  'default-welcome-page': { tone: 'warning', label: 'New first page', help: 'its users get the default welcome page (the giant screen and the Start button) as their first page' },
  'picture-on-welcome-page': { tone: 'warning', label: 'Picture on its welcome page', help: 'its welcome page has no picture of its own and shows the drawn one' },
  none: { tone: 'neutral', label: 'No visible change', help: 'its users see the same pages as before' },
};

const OUTCOME_LABEL: Record<BackfillResult['outcome'], string> = { drawn: 'Made', 'already-done': 'Already done', 'not-found': 'Not found', failed: 'Not made' };

export default function WelcomeScreenBackfillCard() {
  const [plan, setPlan] = useState<BackfillPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'count' | 'run' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null);
  const [results, setResults] = useState<BackfillResult[]>([]);
  const stop = useRef(false);

  const rows = plan?.rows ?? [];
  const chosen = rows.filter((row) => selected.has(row.id));
  const chosenVisible = chosen.filter((row) => row.change !== 'none');

  const count = async () => {
    setBusy('count');
    setError(null);
    setConfirming(false);
    try {
      const next = await call<BackfillPlan>();
      setPlan(next);
      // A count never selects anything for you; what was chosen before stays chosen only while the event is still in the list.
      setSelected((current) => new Set(next.rows.filter((row) => current.has(row.id)).map((row) => row.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const choose = (predicate: (row: BackfillRow) => boolean) => setSelected(new Set(rows.filter(predicate).map((row) => row.id)));

  const run = async () => {
    stop.current = false;
    setBusy('run');
    setError(null);
    setConfirming(false);
    setResults([]);
    let ids = chosen.map((row) => row.id);
    setProgress({ total: ids.length, done: 0 });
    try {
      while (ids.length > 0 && !stop.current) {
        const batch = await call<BackfillRun>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, eventIds: ids }) });
        setResults((current) => [...current, ...batch.results]);
        ids = batch.remaining;
        setProgress((current) => ({ total: current?.total ?? 0, done: (current?.total ?? 0) - ids.length }));
        if (batch.results.length === 0 && ids.length > 0) throw new Error('The server made nothing in this call; stopped. Count again and try once more.');
      }
      // The list is read again, so the events that were made are gone from it.
      setPlan(await call<BackfillPlan>());
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const totals = plan?.totals;
  const failed = results.filter((result) => result.outcome === 'failed' || result.outcome === 'not-found');
  return (
    <section aria-labelledby="welcome-backfill-title" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', display: 'grid', gap: '0.75rem', marginBottom: '1rem', padding: '1rem 1.5rem' }} data-welcome-backfill>
      <div>
        <h3 id="welcome-backfill-title" style={{ margin: 0 }}>
          Welcome page screens for existing events
        </h3>
        <p style={{ ...muted, margin: '0.25rem 0 0' }}>
          A new event gets a default slideshow and its welcome page screen by itself. The events that were made before have neither. This makes them for the events you choose: the default slideshow (with its tracked &quot;Giant screen&quot; link) and the picture. It
          only adds; nothing is deleted and no page of an event is changed. Count first: a count changes nothing and selects nothing.
        </p>
      </div>
      <InlineAlert
        title="This can change what users see"
        message="For an event that gets the journey defaults and has no welcome page of its own, the picture also brings the default welcome page: its users then see a new first page (the giant screen and the Start button). A welcome page that has no picture of its own shows the drawn one. The count says which events that is."
        severity="warning"
      />
      {error ? <InlineAlert title="Not done" message={error} severity="error" /> : null}
      <Group gap="xs" wrap="wrap">
        <Button type="button" variant="light" loading={busy === 'count'} disabled={busy !== null} onClick={() => void count()}>
          Count what would be made (dry run)
        </Button>
      </Group>

      {plan && totals ? (
        <div style={{ display: 'grid', gap: '0.5rem' }} data-backfill-plan>
          <span>
            {totals.toDo === 0
              ? `Every one of the ${plural(totals.events, 'event')} has its welcome page screen.`
              : `${totals.toDo} of ${plural(totals.events, 'event')} ${totals.toDo === 1 ? 'has' : 'have'} no welcome page screen yet (${totals.withPicture} ${totals.withPicture === 1 ? 'has' : 'have'} one). ${totals.toDoWithoutSlideshow} of them ${totals.toDoWithoutSlideshow === 1 ? 'has' : 'have'} no default slideshow either.`}
          </span>
          {totals.toDo > 0 ? (
            <span style={muted}>
              {totals.toDoUpcoming} upcoming (from {plan.today}), {totals.toDoInactive} inactive. {totals.toDoWithVisibleChange} would show their users something new; the other {totals.toDo - totals.toDoWithVisibleChange} see no difference. The journey defaults switch is{' '}
              <strong>{plan.rolloutOn ? 'on' : 'off'}</strong>
              {plan.rolloutOn ? ': every event that has no welcome page of its own gets the default one.' : ': only events created with the defaults get the default welcome page.'}
            </span>
          ) : null}
        </div>
      ) : null}

      {plan && rows.length > 0 ? (
        <>
          <Group gap="xs" wrap="wrap" aria-label="Choose events">
            <Button type="button" size="xs" variant="light" disabled={busy !== null} onClick={() => setSelected(new Set())}>
              None
            </Button>
            <Button type="button" size="xs" variant="light" disabled={busy !== null || totals?.toDoUpcoming === 0} onClick={() => choose((row) => row.upcoming)}>
              Upcoming ({totals?.toDoUpcoming ?? 0})
            </Button>
            <Button type="button" size="xs" variant="light" disabled={busy !== null || totals?.toDoWithVisibleChange === totals?.toDo} onClick={() => choose((row) => row.change === 'none')}>
              No visible change ({(totals?.toDo ?? 0) - (totals?.toDoWithVisibleChange ?? 0)})
            </Button>
            <Button type="button" size="xs" variant="light" disabled={busy !== null} onClick={() => choose(() => true)}>
              All ({rows.length})
            </Button>
          </Group>
          <div style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.75rem', display: 'grid', maxHeight: '26rem', overflowY: 'auto' }} data-backfill-list>
            {rows.map((row) => {
              const change = CHANGE_LABEL[row.change];
              return (
                <Checkbox
                  key={row.id}
                  checked={selected.has(row.id)}
                  disabled={busy !== null}
                  onChange={(event) => toggle(row.id, event.currentTarget.checked)}
                  styles={{ root: { borderBottom: '1px solid var(--mantine-color-default-border)', padding: '0.5rem 0.75rem' }, body: { alignItems: 'flex-start' }, labelWrapper: { flex: '1 1 12rem', minWidth: 0 }, label: { cursor: 'pointer' } }}
                  label={
                    <span style={{ display: 'grid', gap: '0.25rem', overflowWrap: 'anywhere' }}>
                      <strong style={{ fontSize: '0.875rem' }}>{row.name}</strong>
                      <span style={muted}>{[row.partnerName, row.eventDate ? row.eventDate.slice(0, 10) : 'no date'].filter(Boolean).join(' · ')}</span>
                      <span style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                        {row.upcoming ? <LabelTag tone="info" label="Upcoming" /> : null}
                        {row.isActive ? null : <VisibilityStatusIcon isVisible={false} />}
                        <LabelTag tone={change.tone} label={change.label} />
                        <LabelTag tone="neutral" label={row.hasDefaultSlideshow ? 'Has its slideshow' : 'Slideshow to be made'} />
                      </span>
                      <span style={muted}>If made: {change.help}.</span>
                    </span>
                  }
                />
              );
            })}
          </div>
          <Group gap="xs" wrap="wrap">
            <Button type="button" disabled={busy !== null || chosen.length === 0 || confirming} onClick={() => setConfirming(true)}>
              {chosen.length === 0 ? 'Make them (choose events first)' : `Make for ${plural(chosen.length, 'event')}`}
            </Button>
          </Group>
        </>
      ) : null}

      {confirming ? (
        <InlineAlert
          title={`Make the welcome page screen for ${plural(chosen.length, 'event')}?`}
          message={`This writes to the live service: a default slideshow (and its tracked link) where there is none, and the picture, for the ${plural(chosen.length, 'event')} you chose. ${
            chosenVisible.length > 0 ? `${plural(chosenVisible.length, 'event')} will show their users something new${chosenVisible.length <= 6 ? ` (${chosenVisible.map((row) => row.name).join(', ')})` : ''}.` : 'None of them shows its users anything new.'
          } Nothing is deleted and no page is changed; you can run it again safely.`}
          severity="warning"
        />
      ) : null}
      {confirming ? (
        <Group gap="xs" wrap="wrap">
          <Button type="button" color="red" loading={busy === 'run'} disabled={busy !== null} onClick={() => void run()}>
            Yes, make them
          </Button>
          <Button type="button" variant="light" disabled={busy !== null} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </Group>
      ) : null}

      {progress ? (
        <div style={{ display: 'grid', gap: '0.5rem' }} data-backfill-results>
          <span style={{ fontSize: '0.875rem' }}>
            {busy === 'run' ? 'Working: ' : 'Done: '}
            {progress.done} of {progress.total} looked at, {results.filter((result) => result.outcome === 'drawn').length} made, {results.filter((result) => result.outcome === 'already-done').length} already done, {failed.length} not made.
          </span>
          {busy === 'run' ? (
            <Group gap="xs" wrap="wrap">
              <Button type="button" variant="light" onClick={() => (stop.current = true)}>
                Stop after this call
              </Button>
            </Group>
          ) : null}
          {failed.length > 0 ? (
            <ul style={{ fontSize: '0.8125rem', margin: 0, paddingLeft: '1.25rem' }}>
              {failed.map((result) => (
                <li key={result.id} style={{ overflowWrap: 'anywhere' }}>
                  {OUTCOME_LABEL[result.outcome]}: {result.name || result.id}. {result.reason ? `${result.reason.replace(/\.$/, '')}. ` : ''}It is still to do: count again to see it in the list.
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
