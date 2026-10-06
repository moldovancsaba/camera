'use client';

/**
 * Rollout of photo vetting to the events that already exist (camera#271). Dry run first: it writes nothing. The run is enabled once a
 * dry-run report is on screen and has been ticked as read, asks for a confirmation, and can be repeated.
 */

import { useState } from 'react';
import { Button, Checkbox, Stack, Text } from '@/components/gds/PublicPrimitives';
import { InlineAlert, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import type { RolloutReport, RolloutResult } from '@/lib/photo-vetting/rollout';

const ENDPOINT = '/api/admin/photo-vetting-rollout';

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
      {note ? <span style={{ color: 'var(--gds-color-muted)' }}> {note}</span> : null}
    </dd>
  </>
);

export default function PhotoVettingRolloutConsole() {
  const { confirm } = useGdsConfirm();
  const [report, setReport] = useState<RolloutReport | null>(null);
  const [reportAt, setReportAt] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RolloutResult | null>(null);
  const [dryError, setDryError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function dryRun() {
    setChecking(true);
    setDryError(null);
    try {
      const data = await post<{ report: RolloutReport }>({ mode: 'dry-run' });
      setReport(data.report);
      setReportAt(new Date().toLocaleString());
      setReviewed(false);
    } catch (e) {
      setDryError(e instanceof Error ? e.message : 'Dry run failed');
    } finally {
      setChecking(false);
    }
  }

  async function run() {
    if (!report) return;
    const confirmed = await confirm({
      title: 'Turn photo vetting on for every event',
      message: `From now on the photos of ${report.toTurnOn} event${report.toTurnOn === 1 ? '' : 's'} wait for approval before the guest gets a link: guests see the shapes of the frame instead of the frame, and the event's managers approve the photos under the event's Photos tab. ${report.busyNow.length ? `${report.busyNow.length} of them took photos in the last 24 hours. ` : ''}Photos made before this stay as they are. You can turn vetting off again per event.`,
      targetName: `${report.toTurnOn} event${report.toTurnOn === 1 ? '' : 's'}`,
    });
    if (!confirmed) return;
    setRunning(true);
    setRunError(null);
    try {
      const data = await post<{ result: RolloutResult }>({ mode: 'run' });
      setResult(data.result);
    } catch (e) {
      setRunError(`${e instanceof Error ? e.message : 'The request failed.'} Run again to continue: events that are already on are skipped.`);
    } finally {
      setRunning(false);
    }
    await dryRun();
  }

  return (
    <Stack gap="xl">
      <FormSection title="1. Dry run" description="Counts the events and shows which of them took photos in the last 24 hours and week. Nothing is written.">
        <div>
          <Button variant="light" loading={checking} disabled={running} onClick={() => void dryRun()}>
            Run the dry run
          </Button>
        </div>
        {dryError ? <InlineAlert title="Not done" message={dryError} severity="error" /> : null}
        {report ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Report from {reportAt}
            </Text>
            <dl style={{ display: 'grid', gap: '0.375rem 1rem', gridTemplateColumns: 'minmax(0, 40%) minmax(0, 1fr)', overflowWrap: 'anywhere', margin: 0 }}>
              {row('Events', report.totalEvents)}
              {row('Photo vetting already on', report.alreadyOn)}
              {row('To turn on', report.toTurnOn)}
              {row('…took photos in the last 7 days', report.activeThisWeek, 'their next photos will wait for approval')}
              {row('…took photos in the last 24 hours', report.busyNow.length, 'busy right now')}
            </dl>
            {report.busyNow.length > 0 ? (
              <Stack gap={4}>
                <Text size="sm" fw={700}>
                  Busy right now (photos in the last 24 hours / 7 days)
                </Text>
                <ul style={{ margin: 0, paddingInlineStart: '1.25rem' }}>
                  {report.busyNow.map((event) => (
                    <li key={event.id}>
                      <a href={`/admin/events/${event.id}/vetting`}>{event.name}</a>
                      {event.partnerName ? <span style={{ color: 'var(--gds-color-muted)' }}> ({event.partnerName})</span> : null}: {event.photosLast24h} / {event.photosLast7d}
                    </li>
                  ))}
                </ul>
              </Stack>
            ) : null}
          </Stack>
        ) : null}
      </FormSection>

      <FormSection title="2. Run" description="Turns photo vetting on for every event that does not have it. It needs a dry-run report on screen that you have read. Photos made before this are not touched.">
        <Checkbox label="I have read the dry-run report above" checked={reviewed} onChange={(event) => setReviewed(event.currentTarget.checked)} disabled={!report || running} />
        <div>
          <Button loading={running} disabled={!report || !reviewed || report.toTurnOn === 0 || checking} onClick={() => void run()}>
            Turn photo vetting on for every event
          </Button>
        </div>
        {runError ? <InlineAlert title="The run stopped" message={runError} severity="error" /> : null}
        {result ? (
          <div role="status">
            <Text size="sm" fw={700}>
              Done: {result.turnedOn} event{result.turnedOn === 1 ? '' : 's'} switched on. {result.alreadyOn} of {result.totalEvents} events have photo vetting on.
            </Text>
          </div>
        ) : null}
      </FormSection>
    </Stack>
  );
}
