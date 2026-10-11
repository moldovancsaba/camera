'use client';

/**
 * The Journey tab of the Analytics view (issue 521, phase 2; docs/JOURNEY_RECORDING.md): what the anonymous recording of the capture pages says. A pure function of the summary it is given
 * (lib/analytics/journey.ts) and of the state of the kill switch. Where nothing was recorded for the event the tab says so, in words, and shows no zeros. Copy says "user" (dictionary rule).
 */

import type { JourneySummary } from '@/lib/analytics/journey';
import { isRecorded } from '@/lib/analytics/journey';
import { formatCount, formatDay, formatRate, formatShare } from '@/lib/analytics/format';
import { formatDuration } from '@/lib/analytics/time';
import JourneySwitch from './JourneySwitch';
import { Bars, Metrics, Note, Panel, Table } from './ui';

export interface JourneySettingState {
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
  /** The viewer is a global admin and gets the buttons. */
  canChange: boolean;
}

const plural = (count: number, one: string, many = `${one}s`) => `${formatCount(count)} ${count === 1 ? one : many}`;

export default function JourneySection({ journey, setting, timeZone }: { journey: JourneySummary; setting: JourneySettingState; timeZone: string }) {
  return (
    <>
      <JourneySwitch enabled={setting.enabled} updatedAt={setting.updatedAt} updatedBy={setting.updatedBy} canChange={setting.canChange} timeZone={timeZone} />
      {isRecorded(journey) ? <Recorded journey={journey} /> : <NotRecorded enabled={setting.enabled} />}
    </>
  );
}

function NotRecorded({ enabled }: { enabled: boolean }) {
  return (
    <Panel title="Nothing recorded for this event yet" description="These are not zeros: no record of the journey exists for this event, so there is nothing to count.">
      <Note>
        {enabled
          ? 'The recording is on. The first user who opens the capture page of this event after the recording was released starts it; the figures then appear here.'
          : 'The recording is switched off, so nothing is being recorded. Switch it on above to start.'}{' '}
        Visits before the recording started are not recorded and cannot be added afterwards.
      </Note>
    </Panel>
  );
}

function Recorded({ journey }: { journey: JourneySummary }) {
  const { camera, photos, saves, consent, shares } = journey;
  return (
    <>
      <Note>
        Recorded since {formatDay(journey.since ?? '')}, last record on {formatDay(journey.lastDay ?? '')}. A visit is one load of the capture page, not a person: the same user opening the link twice is two visits. The days are UTC days, whatever clock is chosen
        above. {journey.rangeBeforeStart ? 'The days chosen end before the recording started, so everything below is zero because nothing was being recorded yet.' : ''}
      </Note>

      <Metrics
        items={[
          { label: 'Visits', value: formatCount(journey.opens), description: `${plural(journey.resumed, 'return')} from a sign-in not counted as visits` },
          { label: 'Saved a photo', value: formatCount(journey.completed), description: `${formatRate(journey.completionRate)} of the visits` },
          { label: 'Median time to the first photo', value: formatDuration(journey.medianCompleteSeconds), description: journey.medianCompleteSeconds === null ? 'No saved photo among the last 30 days of records' : 'From opening the page to the first saved photo, last 30 days' },
          { label: 'Camera denied', value: formatCount(camera.denied), description: `${formatRate(camera.deniedRate)} of the times a desktop camera was asked for` },
          { label: 'Retakes', value: formatCount(photos.retakes), description: photos.retakesPerPhoto === null ? 'No photo taken yet' : `${(Math.round(photos.retakesPerPhoto * 100) / 100).toString()} for each photo taken` },
          { label: 'Consent left', value: formatCount(consent.abandoned), description: `Shown to ${formatCount(consent.shown)} visits, accepted by ${formatCount(consent.accepted)}` },
          { label: 'Shares', value: formatCount(shares.clicks), description: 'Share buttons pressed after the photo was saved' },
          { label: 'Downloads', value: formatCount(shares.downloads), description: `${plural(shares.views, 'view')} of the public photo page` },
        ]}
      />

      <Panel title="Steps reached" description="How many visits reached each step at least once, out of all visits. The steps an event does not have stay at zero; the order is the usual one, an editor can change it.">
        <Bars label="Steps reached" rows={journey.steps} total={journey.opens} />
      </Panel>

      <Panel title="Devices and time" description="The kind of device is read from the request when the page opens and is the only thing kept of it: the device string itself is not stored.">
        <Bars label="Devices of the visits" rows={journey.devices} total={journey.opens} />
        <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>From opening the page to the first saved photo</strong>
        <Bars label="Time to the first saved photo" rows={journey.timeToComplete} total={journey.completed} empty="No visit saved a photo yet." />
      </Panel>

      <Panel title="Camera, photos and saving" description="A phone takes the photo with its own camera app, which asks for nothing on the page; the permission figures are for the live camera of a desktop.">
        <Metrics
          items={[
            { label: 'Camera permission granted', value: formatCount(camera.granted) },
            { label: 'Camera permission denied', value: formatCount(camera.denied) },
            { label: 'No camera or in use', value: formatCount(camera.unavailable) },
            { label: 'Photos taken', value: formatCount(photos.taken), description: 'Counted on the page, before saving' },
            { label: 'Saved', value: formatCount(saves.ok) },
            { label: 'Save failed', value: formatCount(saves.failed), description: 'The user saw an error and could try again' },
          ]}
        />
        <Bars label="How photos were taken" rows={photos.byMethod} total={photos.taken} empty="No photo taken yet." />
      </Panel>

      <Panel title="Consent" description="Shown is counted once per visit and form: the consent page, or the box on the Who-are-you page. Left is shown and not accepted.">
        <Table
          caption="Consent shown and accepted"
          rows={[
            { id: 'page', label: 'The consent page', ...consent.page, left: Math.max(0, consent.page.shown - consent.page.accepted) },
            { id: 'box', label: 'The box on the Who-are-you page', ...consent.box, left: Math.max(0, consent.box.shown - consent.box.accepted) },
          ]}
          getKey={(row) => row.id}
          columns={[
            { key: 'form', header: 'Form', rowHeader: true, render: (row) => row.label },
            { key: 'shown', header: 'Shown', numeric: true, render: (row) => formatCount(row.shown) },
            { key: 'accepted', header: 'Accepted', numeric: true, render: (row) => formatCount(row.accepted) },
            { key: 'left', header: 'Left', numeric: true, render: (row) => formatCount(row.left) },
            { key: 'share', header: 'Accepted of shown', numeric: true, render: (row) => formatShare(row.accepted, row.shown) },
          ]}
        />
      </Panel>

      <Panel title="Shares and downloads" description="The buttons after the photo was saved, and what happened to the link: the public photo page opened by a person (not a link preview) and the photo downloaded from it.">
        <Bars label="Share buttons pressed" rows={shares.byChannel} total={shares.clicks} empty="No share button pressed yet." />
      </Panel>

      <Panel title="Visits per day" description="UTC days.">
        <Table
          caption="Visits and saved photos per day"
          rows={journey.days}
          getKey={(row) => row.day}
          empty="No visit in this period."
          columns={[
            { key: 'day', header: 'Day (UTC)', rowHeader: true, render: (row) => formatDay(row.day) },
            { key: 'opens', header: 'Visits', numeric: true, render: (row) => formatCount(row.opens) },
            { key: 'completed', header: 'Saved a photo', numeric: true, render: (row) => formatCount(row.completed) },
          ]}
        />
      </Panel>
    </>
  );
}
