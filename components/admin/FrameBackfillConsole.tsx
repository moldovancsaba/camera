'use client';

/**
 * Rollout of the generated default frame to the events that already exist (camera#238). Dry run first: it writes
 * nothing and, with the messmass check, only reads. Run is enabled once a dry-run report is on screen and has been
 * ticked as read; it works through the events a few per request until none is left, can be stopped, and can be repeated
 * (events with an own frame are never touched, events with images are skipped).
 */

import { useRef, useState } from 'react';
import { Button, Checkbox, Paper, Stack, Text } from '@/components/gds/PublicPrimitives';
import { InlineAlert, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import type { BackfillReport, BatchResult } from '@/lib/frame/backfill';

const ENDPOINT = '/api/admin/frame-backfill';
const BATCH = 3;

interface Totals {
  processed: number;
  completed: number;
  imagesDrawn: number;
  imagesReused: number;
  failures: BatchResult['failures'];
  waiting: BatchResult['waiting'];
  remaining: number;
}

const zero: Totals = { processed: 0, completed: 0, imagesDrawn: 0, imagesReused: 0, failures: [], waiting: [], remaining: 0 };

async function post<T>(body: unknown): Promise<T> {
  const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload.data;
}

const row = (label: string, value: string | number, note?: string) => (
  <>
    <dt>{label}</dt>
    <dd style={{ margin: 0 }}>
      <strong>{value}</strong>
      {note ? <span style={{ color: 'var(--mantine-color-dimmed)' }}> {note}</span> : null}
    </dd>
  </>
);

export default function FrameBackfillConsole() {
  const { confirm } = useGdsConfirm();
  const [probe, setProbe] = useState(true);
  const [report, setReport] = useState<BackfillReport | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [dryError, setDryError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const stop = useRef(false);

  async function dryRun(withProbe: boolean) {
    setChecking(true);
    setDryError(null);
    try {
      const data = await post<{ report: BackfillReport }>({ mode: 'dry-run', probe: withProbe });
      setReport(data.report);
      setReportAt(new Date().toLocaleString());
      setReviewed(false);
    } catch (e) {
      setDryError(e instanceof Error ? e.message : 'Dry run failed');
    } finally {
      setChecking(false);
    }
  }

  async function run(redraw = false) {
    if (!report) return;
    const confirmed = redraw
      ? await confirm({
          title: 'Redraw the older images',
          message: `This draws again the images of ${report.doneStale} events that were made with an older drawing code (for example before the event emoji was used as a logo), ${BATCH} events at a time, and replaces them in Blob storage. The messmass data of those events is not changed. You can stop at any time and run again.`,
          targetName: `${report.doneStale} event${report.doneStale === 1 ? '' : 's'}`,
        })
      : await confirm({
          title: 'Give the events a generated frame',
          message: `This takes the messmass snapshot and draws the frame images for up to ${report.todo} events without a frame of their own, ${BATCH} at a time, and writes them to the events and to Blob storage. Events with a frame of their own are not touched. You can stop at any time and run again; finished events are skipped.`,
          targetName: `${report.todo} event${report.todo === 1 ? '' : 's'}`,
        });
    if (!confirmed) return;

    stop.current = false;
    setRunning(true);
    setRunError(null);
    let sum: Totals = { ...zero };
    setTotals(sum);
    try {
      let after: string | null = null;
      while (!stop.current) {
        const answer: { batch: BatchResult } = await post<{ batch: BatchResult }>({ mode: 'run', limit: BATCH, after, redraw });
        const batch: BatchResult = answer.batch;
        sum = {
          processed: sum.processed + batch.processed,
          completed: sum.completed + batch.completed,
          imagesDrawn: sum.imagesDrawn + batch.imagesDrawn,
          imagesReused: sum.imagesReused + batch.imagesReused,
          failures: [...sum.failures, ...batch.failures],
          waiting: [...sum.waiting, ...batch.waiting],
          remaining: batch.remaining,
        };
        setTotals(sum);
        if (batch.done) break;
        after = batch.nextAfter;
      }
    } catch (e) {
      setRunError(`${e instanceof Error ? e.message : 'The request failed.'} Run again to continue: finished events are skipped.`);
    } finally {
      setRunning(false);
    }
    await dryRun(false);
  }

  return (
    <Stack gap="xl">
      <FormSection
        title="1. Dry run"
        description="Counts what a run would do. Nothing is written or drawn. With the messmass check, each linked event is asked once (a read-only request) so the report can tell how many frames will have a logo, real teams or a pairing from the name, and which theme they get."
      >
        <Checkbox label="Also ask messmass about each linked event (read-only, up to a minute)" checked={probe} onChange={(event) => setProbe(event.currentTarget.checked)} disabled={checking || running} />
        <div>
          <Button variant="light" loading={checking} disabled={running} onClick={() => void dryRun(probe)}>
            Run the dry run
          </Button>
        </div>
        {dryError ? <InlineAlert title="Not done" message={dryError} severity="error" /> : null}
        {report ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Report from {reportAt}
            </Text>
            {!report.messmassConfigured ? (
              <InlineAlert title="messmass is not configured here" message="Linked events would wait: no frame is drawn from camera’s fallback for them. Set the messmass URL and secret first." severity="warning" />
            ) : null}
            <dl style={{ display: 'grid', gap: '0.375rem 1rem', gridTemplateColumns: 'minmax(0, 40%) minmax(0, 1fr)', overflowWrap: 'anywhere', margin: 0 }}>
              {row('Events', report.total)}
              {row('With a frame of their own', report.ownFrame, 'not touched')}
              {row('Already have generated images', report.done, 'skipped by the first run')}
              {row('…drawn with an older drawing code', report.doneStale, 'the redraw run draws these again')}
              {row('To do', report.todo)}
              {row('…linked to messmass', report.todoLinked, 'frame built from messmass data')}
              {row('…camera-native (no link)', report.todoNative, 'frame built from camera’s own name and partner logo, no teams, system theme')}
              {row('…of which without a partner logo', report.nativeWithoutPartnerLogo, 'the frame has no logo')}
              {row('…switched off (inactive)', report.todoInactive)}
              {row('…with a snapshot but no images', report.todoWithSnapshot)}
            </dl>
            {report.probe ? (
              <Paper withBorder p="sm">
                <Stack gap="xs">
                  <Text size="sm" fw={700}>
                    messmass answered for {report.probe.answered} of {report.probe.asked} linked events asked
                    {report.probe.unavailable ? ` (${report.probe.unavailable} gave no usable answer and would wait)` : ''}
                    {report.probe.incomplete ? ' – stopped early, the numbers cover the events asked' : ''}
                  </Text>
                  <dl style={{ display: 'grid', gap: '0.25rem 1rem', gridTemplateColumns: 'minmax(0, 40%) minmax(0, 1fr)', overflowWrap: 'anywhere', margin: 0 }}>
                    {row('Theme from', Object.entries(report.probe.styleFrom).map(([from, n]) => `${from}: ${n}`).join(', ') || 'none')}
                    {row('With a logo', report.probe.withLogo, `without: ${report.probe.withoutLogo}`)}
                    {row('Teams text', `${report.probe.teams.both} real teams, ${report.probe.teams.pairingInName} pairing in the name, ${report.probe.teams.nameOnly} event name only`)}
                    {row('Custom partner font', report.probe.customFont)}
                  </dl>
                  {report.probe.examples.withoutLogo.length ? <Text size="xs" c="dimmed">No logo, for example: {report.probe.examples.withoutLogo.join('; ')}</Text> : null}
                  {report.probe.examples.nameOnly.length ? <Text size="xs" c="dimmed">Event name only, for example: {report.probe.examples.nameOnly.join('; ')}</Text> : null}
                </Stack>
              </Paper>
            ) : null}
          </Stack>
        ) : null}
      </FormSection>

      <FormSection title="2. Run" description={`Takes the snapshot and draws the images, ${BATCH} events at a time. It needs a dry-run report on screen that you have read. Linked events messmass does not answer for are left for a later run.`}>
        <Checkbox label="I have read the dry-run report above" checked={reviewed} onChange={(event) => setReviewed(event.currentTarget.checked)} disabled={!report || running} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <Button loading={running} disabled={!report || !reviewed || report.todo === 0 || checking} onClick={() => void run()}>
            Give the events a generated frame
          </Button>
          <Button variant="light" loading={running} disabled={!report || !reviewed || report.doneStale === 0 || checking} onClick={() => void run(true)}>
            {report ? `Redraw the older images (${report.doneStale})` : 'Redraw the older images'}
          </Button>
          {running ? (
            <Button variant="light" onClick={() => (stop.current = true)}>
              Stop after this batch
            </Button>
          ) : null}
        </div>
        {runError ? <InlineAlert title="The run stopped" message={runError} severity="error" /> : null}
        {totals ? (
          <div role="status">
            <Stack gap="xs">
              <Text size="sm" fw={700}>
                {running ? 'Running…' : 'Finished'}: {totals.completed} events have images now, {totals.imagesDrawn} images drawn, {totals.imagesReused} reused
                {totals.remaining ? `, ${totals.remaining} left in the list` : ''}.
              </Text>
              {totals.waiting.length ? (
                <InlineAlert
                  title={`${totals.waiting.length} linked event${totals.waiting.length === 1 ? '' : 's'} waiting for messmass`}
                  message={`${totals.waiting.slice(0, 8).map((w) => w.name).join('; ')}${totals.waiting.length > 8 ? '; …' : ''}. Run again once messmass answers.`}
                  severity="warning"
                />
              ) : null}
              {totals.failures.length ? (
                <InlineAlert
                  title={`${totals.failures.length} event${totals.failures.length === 1 ? '' : 's'} failed`}
                  message={totals.failures.slice(0, 8).map((f) => `${f.name || f.id}: ${f.error}`).join('; ')}
                  severity="error"
                />
              ) : null}
            </Stack>
          </div>
        ) : null}
      </FormSection>
    </Stack>
  );
}
