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
          { label: 'Saved a photo', value: formatCount(journey.completed), description: `${formatRate(journey.completionRate)} of visits saved at least one photo` },
          { label: 'Finished journeys', value: formatCount(journey.finished), description: `${formatRate(journey.finishRate)} of visits reached the final configured page after saving` },
          { label: 'Average selfie flow time', value: formatDuration(journey.averageCompleteSeconds), description: journey.averageCompleteSeconds === null ? 'No completed journey duration is recorded yet' : `From opening the first page through the final configured page; ${formatCount(journey.averageCompleteSamples)} completed journeys` },
          { label: 'Median selfie flow time', value: formatDuration(journey.medianCompleteSeconds), description: 'From opening the first page through the final configured page, last 30 days' },
          { label: 'CTA click rate', value: formatRate(journey.ctaClickRate), description: `${formatCount(journey.ctaClicks)} of ${formatCount(journey.steps.find((step) => step.id === 'cta')?.count ?? 0)} visits that reached a CTA page clicked an action` },
          { label: 'Camera denied', value: formatCount(camera.denied), description: `${formatRate(camera.deniedRate)} of the times a desktop camera was asked for` },
          { label: 'Retakes', value: formatCount(photos.retakes), description: photos.retakesPerPhoto === null ? 'No photo taken yet' : `${(Math.round(photos.retakesPerPhoto * 100) / 100).toString()} for each photo taken` },
          { label: 'Consent left', value: formatCount(consent.abandoned), description: `Shown to ${formatCount(consent.shown)} visits, accepted by ${formatCount(consent.accepted)}` },
          { label: 'Shares', value: formatCount(shares.clicks), description: 'Share buttons pressed after the photo was saved' },
          { label: 'Downloads', value: formatCount(shares.downloads), description: `${plural(shares.views, 'view')} of the public photo page` },
        ]}
      />

      <Panel title="Sign-in and identity choices" description="The choice made on the Who-are-you page. Google and Facebook are clicks that start SSO; Pseudo is a valid submission of the name and e-mail form. These are choices, not confirmation that an SSO sign-in completed.">
        <Metrics items={journey.loginMethods.map((method) => ({ label: method.id === 'pseudo' ? 'Pseudo form' : method.id[0].toUpperCase() + method.id.slice(1), value: formatRate(method.shareOfChoices), description: `${formatCount(method.count)} of ${formatCount(journey.loginMethodChoices)} recorded choices` }))} />
        {journey.loginMethodChoices === 0 ? <Note>No sign-in or identity method has been selected during the recorded visits.</Note> : null}
      </Panel>

      <Panel title="Google and Facebook sign-in outcomes" description="The OAuth callback records only provider and a fixed outcome category. No email, account ID, token, or provider error text is stored in Journey analytics.">
        <Table caption="Sign-in callback outcomes" rows={journey.authentication.filter((row) => row.count > 0)} getKey={(row) => row.id} empty="No capture-flow SSO callback outcomes have been recorded yet." columns={[
          { key: 'outcome', header: 'Outcome', rowHeader: true, render: (row) => row.label },
          { key: 'count', header: 'Count', numeric: true, render: (row) => formatCount(row.count) },
          { key: 'share', header: 'Share of outcomes', numeric: true, render: (row) => formatRate(row.shareOfResults) },
        ]} />
      </Panel>

      <Panel title="Steps reached" description="How many visits reached each step at least once, out of all visits. The steps an event does not have stay at zero; the order is the usual one, an editor can change it.">
        <Bars label="Steps reached" rows={journey.steps} total={journey.opens} />
      </Panel>

      <Panel title="Step-to-step movement" description="A direct transition is counted once per visit and direction. This shows where visits continued between the steps they actually saw; custom orders and branches are retained.">
        <Table caption="Direct journey transitions" rows={journey.transitions} getKey={(row) => row.id} empty="No direct step transitions have been recorded yet." columns={[
          { key: 'transition', header: 'From → to', rowHeader: true, render: (row) => row.label },
          { key: 'visits', header: 'Visits', numeric: true, render: (row) => formatCount(row.count) },
          { key: 'share', header: 'Of visits reaching the starting step', numeric: true, render: (row) => formatRate(row.shareOfFrom) },
        ]} />
      </Panel>

      <Panel title="CTA actions and returns" description="External link openings and internal Continue actions, plus a return to the capture tab after an external link was opened. A return can only be observed when the capture tab regains focus.">
        <Table caption="CTA actions" rows={journey.ctaActions} getKey={(row) => row.id} columns={[
          { key: 'action', header: 'Action', rowHeader: true, render: (row) => row.label },
          { key: 'count', header: 'Visits', numeric: true, render: (row) => formatCount(row.count) },
          { key: 'share', header: 'Share of CTA actions', numeric: true, render: (row) => formatRate(row.shareOfActions) },
        ]} />
        <Metrics items={[{ label: 'Returned to capture', value: formatCount(journey.ctaReturns), description: 'Capture tab regained focus after an external CTA opened' }]} />
      </Panel>

      <Panel title="Devices and time" description="The kind of device is read from the request when the page opens and is the only thing kept of it: the device string itself is not stored.">
        <Bars label="Devices of the visits" rows={journey.devices} total={journey.opens} />
        <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>From opening the first page through the final configured page</strong>
        <Bars label="Selfie flow duration" rows={journey.timeToComplete} total={journey.finished} empty="No journey has reached its final page yet." />
      </Panel>

      <Panel title="Camera, photos and saving" description="A phone takes the photo with its own camera app, which asks for nothing on the page; the permission figures are for the live camera of a desktop.">
        <Metrics
          items={[
            { label: 'Camera permission granted', value: formatCount(camera.granted) },
            { label: 'Camera permission denied', value: formatCount(camera.denied) },
            { label: 'Camera not available', value: formatCount(camera.unavailable), description: 'No camera, in use by another program, or it failed' },
            { label: 'Photos taken', value: formatCount(photos.taken), description: 'Counted on the page, before saving' },
            { label: 'Photo uploads started', value: formatCount(photos.uploadStarted), description: 'Temporary camera copies sent to event storage immediately after capture' },
            { label: 'Photo uploads completed', value: formatCount(photos.uploadSucceeded), description: 'Temporary camera copies stored for the capture flow' },
            { label: 'Photo uploads failed', value: formatCount(photos.uploadFailed), description: 'Temporary upload errors; the normal save can still continue' },
            { label: 'Saved', value: formatCount(saves.ok) },
            { label: 'Save failed', value: formatCount(saves.failed), description: 'The user saw an error and could try again' },
          ]}
        />
        <Bars label="How photos were taken" rows={photos.byMethod} total={photos.taken} empty="No photo taken yet." />
      </Panel>

      <Panel title="Upload reliability by device and capture method" description="One row per upload attempt group. Upload timing is stored as short duration bands; no exact network address or image is part of Journey analytics.">
        <Table caption="Photo uploads by device and capture method" rows={photos.uploadsByDeviceMethod} getKey={(row) => row.id} empty="No upload details have been recorded yet." columns={[
          { key: 'group', header: 'Device · method', rowHeader: true, render: (row) => row.label },
          { key: 'started', header: 'Started', numeric: true, render: (row) => formatCount(row.started) },
          { key: 'succeeded', header: 'Succeeded', numeric: true, render: (row) => formatCount(row.succeeded) },
          { key: 'failed', header: 'Failed', numeric: true, render: (row) => formatCount(row.failed) },
          { key: 'successRate', header: 'Success rate', numeric: true, render: (row) => formatRate(row.started > 0 ? row.succeeded / row.started : null) },
          { key: 'duration', header: 'Duration bands', render: (row) => row.durations.filter((duration) => duration.count > 0).map((duration) => `${duration.label}: ${formatCount(duration.count)}`).join(' · ') || 'n/a' },
        ]} />
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
            { key: 'completed', header: 'Photos saved', numeric: true, render: (row) => formatCount(row.completed) },
          ]}
        />
      </Panel>
    </>
  );
}
