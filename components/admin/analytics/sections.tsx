'use client';

/**
 * The tabs of the Analytics view (issue 521, phase 1), each a function of the numbers of lib/analytics/report.ts: nothing here reads the database or computes a figure that the report does not
 * hold, so the page, the export and the counters for messmass say the same thing. Copy says "user" (dictionary rule).
 */

import Link from 'next/link';
import PeopleSummaryCard from '@/components/admin/PeopleSummaryCard';
import { formatCount, formatDateTime, formatDay, formatHour, formatRate, formatShare } from '@/lib/analytics/format';
import { NOT_MEASURED, type EventReport, type EventsTableRow } from '@/lib/analytics/report';
import type { SourcesReport } from '@/lib/analytics/sources';
import { REPORT_TIME_ZONES, formatDuration } from '@/lib/analytics/time';
import { Bars, Columns, Metrics, Note, Panel, Table } from './ui';

const plural = (count: number, one: string, many = `${one}s`) => `${formatCount(count)} ${count === 1 ? one : many}`;

export function OverviewSection({ report, sources, table }: { report: EventReport; sources?: SourcesReport; table?: EventsTableRow[] }) {
  const { photos, users, vetting, screens, emails, consents, people } = report;
  const days = report.activity.days;
  const hours = report.activity.hours;
  return (
    <>
      <Metrics
        items={[
          { label: 'Users', value: formatCount(users.distinct), description: `${formatCount(users.returning)} took more than one photo. ${plural(users.photosWithoutIdentity, 'photo')} without an e-mail or an account are not in this number.` },
          { label: 'Approval rate', value: formatRate(photos.approvalRate), description: `${formatCount(photos.approved)} approved, ${formatCount(photos.rejected)} declined` },
          { label: 'Time to first decision', value: formatDuration(vetting.timeToFirstDecision.avgSeconds), description: vetting.timeToFirstDecision.count > 0 ? `Median ${formatDuration(vetting.timeToFirstDecision.medianSeconds)}, over ${plural(vetting.timeToFirstDecision.count, 'decided photo')}` : 'No photo has been decided yet' },
          { label: 'Plays on the screens', value: formatCount(screens.plays), description: `${plural(screens.photosShown, 'photo')} shown, ${formatShare(screens.eligibleShown, screens.eligible)} of those that may be shown` },
          { label: 'Photo link e-mails sent', value: formatCount(emails.photoLink.sent), description: `${formatCount(emails.photoLink.failed)} failed, ${formatCount(emails.photoLink.skipped)} skipped` },
          { label: 'People marked', value: formatCount(people.summary.people), description: `In ${plural(people.summary.photos, 'photo')} that a reviewer looked at` },
          { label: 'Consents given', value: formatCount(consents.photosWithConsent), description: `${plural(consents.photosWithoutConsent, 'photo')} with no consent record (older ones)` },
          ...(sources ? [{ label: 'Link and QR visits', value: formatCount(sources.totals.visits), description: `${formatCount(sources.totals.qr)} through QR codes, ${formatCount(sources.totals.link)} through links` }] : []),
        ]}
      />

      {table ? (
        <Panel title="Events" description="The same counts for each event, the busiest first. Open one to see its tabs.">
          <Table
            caption="Photos and decisions by event"
            rows={table}
            getKey={(row) => row.key}
            empty="No event has a photo in this period."
            columns={[
              { key: 'name', header: 'Event', rowHeader: true, render: (row) => (row.id ? <Link href={`/admin/events/${row.id}/analytics`}>{row.name}</Link> : row.name) },
              { key: 'taken', header: 'Photos', numeric: true, render: (row) => formatCount(row.taken) },
              { key: 'approved', header: 'Approved', numeric: true, render: (row) => formatCount(row.approved) },
              { key: 'rejected', header: 'Declined', numeric: true, render: (row) => formatCount(row.rejected) },
              { key: 'waiting', header: 'Waiting', numeric: true, render: (row) => formatCount(row.waiting) },
              { key: 'users', header: 'Users', numeric: true, render: (row) => formatCount(row.users) },
              { key: 'plays', header: 'Plays', numeric: true, render: (row) => formatCount(row.plays) },
              { key: 'time', header: 'Avg time to decision', numeric: true, render: (row) => formatDuration(row.avgDecisionSeconds) },
            ]}
          />
        </Panel>
      ) : null}

      <Panel title="Photos per day" description={`By the day on the clock of ${zoneName(report)}. Hover a column for the users of that day; the table has them all.`}>
        <Columns
          columns={days.map((day) => ({ key: day.day, label: days.length <= 7 ? formatDay(day.day) : day.day.slice(8), full: formatDay(day.day), value: day.photos, title: `${formatDay(day.day)}: ${plural(day.photos, 'photo')}, ${plural(day.users, 'user')}, ${formatCount(day.newUsers)} new` }))}
          ariaLabel="Photos per day"
          summary={report.activity.busiestDay ? `The busiest day was ${formatDay(report.activity.busiestDay.day)} with ${plural(report.activity.busiestDay.photos, 'photo')}.` : 'No photos.'}
          tickEvery={days.length > 14 ? 3 : 1}
          unit="Photos"
          min={14}
        />
        {days.length > 0 ? (
          <Table
            caption="Users and consents by day"
            rows={days}
            getKey={(row) => row.day}
            columns={[
              { key: 'day', header: 'Day', rowHeader: true, render: (row) => formatDay(row.day) },
              { key: 'photos', header: 'Photos', numeric: true, render: (row) => formatCount(row.photos) },
              { key: 'users', header: 'Users', numeric: true, render: (row) => formatCount(row.users) },
              { key: 'new', header: 'New users', numeric: true, render: (row) => formatCount(row.newUsers) },
              { key: 'consented', header: 'With consent', numeric: true, render: (row) => formatCount(row.consented) },
            ]}
          />
        ) : null}
      </Panel>

      <Panel title="Photos per hour of the day" description={`All days together, on the clock of ${zoneName(report)}.`}>
        <Columns
          columns={hours.map((hour) => ({ key: String(hour.hour), label: String(hour.hour).padStart(2, '0'), full: formatHour(hour.hour), value: hour.photos, title: `${formatHour(hour.hour)}: ${plural(hour.photos, 'photo')}, ${plural(hour.users, 'user')}` }))}
          ariaLabel="Photos per hour of the day"
          summary={report.activity.busiestHour ? `The busiest hour was ${formatHour(report.activity.busiestHour.hour)} with ${plural(report.activity.busiestHour.photos, 'photo')}.` : 'No photos.'}
          tickEvery={3}
          unit="Photos"
        />
      </Panel>

      <NotMeasuredPanel />
    </>
  );
}

const zoneName = (report: EventReport) => REPORT_TIME_ZONES.find((zone) => zone.id === report.options.timeZone)?.label ?? report.options.timeZone;

export function NotMeasuredPanel() {
  return (
    <Panel title="Not measured yet" description="What the audit asks for and the data cannot give today. These are not zeros: nothing records them yet. Journey recording and the decline reasons come after the match on 16 October.">
      <ul data-not-measured style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)', listStyle: 'none', margin: 0, padding: 0 }}>
        {NOT_MEASURED.map((row) => (
          <li key={row.what} style={{ borderBottom: '1px solid var(--mantine-color-default-border)', display: 'grid', gap: 2, paddingBottom: 'var(--mantine-spacing-sm)' }}>
            <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{row.what}</strong>
            <span style={{ fontSize: 'var(--mantine-font-size-sm)' }}>{row.why}</span>
            <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)' }}>Waits for: {row.waitsFor}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function PhotosSection({ report }: { report: EventReport }) {
  const { users, choices, framing } = report;
  return (
    <>
      <Panel title="Users" description="A user is told apart by e-mail address or account; a photo with neither cannot be traced to anyone, so it is in the photo counts and not here.">
        <Metrics
          items={[
            { label: 'Different users', value: formatCount(users.distinct), description: `${formatCount(report.photos.taken)} photos, ${formatCount(users.photosPerUser)} a user` },
            { label: 'Signed in', value: formatCount(users.signedIn), description: 'With an account (Google, Facebook or another)' },
            { label: 'Gave an e-mail', value: formatCount(users.typedEmail), description: 'Typed their e-mail and did not sign in' },
            { label: 'Took more than one photo', value: formatCount(users.returning), description: formatShare(users.returning, users.distinct) + ' of the users' },
            { label: 'Photos with no e-mail or account', value: formatCount(users.photosWithoutIdentity), description: 'Older photos and events that do not ask' },
            { label: 'Registered', value: formatCount(users.registered), description: `${formatCount(users.registeredWithPhoto)} of them took a photo (${formatShare(users.registeredWithPhoto, users.registered)}). People who gave their e-mail at the Who-are-you step.` },
          ]}
        />
      </Panel>

      <Panel title="Devices and how the photo was provided" description="The device is read from the browser's own description; an iPad that asks for the desktop site counts as a desktop.">
        <Bars label="Devices" rows={report.devices} total={report.photos.taken} />
        <Bars label="How the photo was provided" rows={report.methods} total={report.photos.taken} />
        <Bars label="Framing of the photo" rows={framing.modes} total={report.photos.taken} />
        <Note>
          {formatCount(framing.mirrored)} of {formatCount(framing.mirroredKnown)} photos with a record were taken with the front camera (mirrored).
        </Note>
      </Panel>

      <Panel title="Frames, messages and layouts chosen" description="What each photo recorded: the event's own frame by name, or the generated default frame with its message and layout.">
        <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>Frames</strong>
        <Bars label="Frames chosen" rows={choices.frames} total={report.photos.taken} />
        <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>Messages ({formatCount(choices.withMessage)} photos carry one)</strong>
        <Bars label="Messages chosen" rows={choices.messages} total={choices.withMessage} empty="No photo recorded a message." />
        <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>Layouts</strong>
        <Bars label="Layouts chosen" rows={choices.layouts} total={choices.withMessage} empty="No photo recorded a layout." />
      </Panel>
    </>
  );
}

export function VettingSection({ report }: { report: EventReport }) {
  const { photos, vetting, people } = report;
  const time = vetting.timeToFirstDecision;
  return (
    <>
      <Metrics
        items={[
          { label: 'Waiting now', value: formatCount(photos.waiting), description: photos.oldestWaitingSeconds !== null ? `The oldest has waited ${formatDuration(photos.oldestWaitingSeconds)}` : 'Nothing is waiting' },
          { label: 'Approved', value: formatCount(photos.approved), description: `${formatRate(photos.approvalRate)} of the decided photos` },
          { label: 'Declined', value: formatCount(photos.rejected), description: `${formatCount(vetting.reasons.rejectionsWithReason)} with a reason written` },
          { label: 'Not vetted', value: formatCount(photos.notVetted), description: 'Taken before vetting or at an event without it' },
          { label: 'Average time to first decision', value: formatDuration(time.avgSeconds), description: time.count > 0 ? `Median ${formatDuration(time.medianSeconds)}, longest ${formatDuration(time.maxSeconds)}` : 'No photo has been decided yet' },
          { label: 'Decisions', value: formatCount(vetting.decisions), description: `${formatCount(vetting.approvals)} approvals, ${formatCount(vetting.rejections)} declines on ${plural(vetting.decidedPhotos, 'photo')}` },
        ]}
      />

      <Panel title="How long photos waited for the first decision" description="From the photo being handed in to the first approval or decline.">
        <Bars label="Time to first decision" rows={vetting.timeBuckets} total={time.count} empty="No photo has been decided yet." />
        {vetting.approvedWithoutRecord > 0 ? <Note>{plural(vetting.approvedWithoutRecord, 'approved photo')} carry no record of who decided and when (approved when vetting was switched on for the event), so they have no time.</Note> : null}
        {vetting.decidedAgain > 0 ? <Note>{plural(vetting.decidedAgain, 'photo')} {vetting.decidedAgain === 1 ? 'was' : 'were'} decided again after the first decision; only the first counts for the time.</Note> : null}
      </Panel>

      <Panel title="Who decided" description="Every approval and decline by the person who made it, and the time of the photos that person decided first.">
        <Table
          caption="Decisions by person"
          rows={vetting.reviewers}
          getKey={(row) => row.by}
          empty="Nobody has decided a photo yet."
          columns={[
            { key: 'by', header: 'Person', rowHeader: true, render: (row) => row.by },
            { key: 'approvals', header: 'Approved', numeric: true, render: (row) => formatCount(row.approvals) },
            { key: 'rejections', header: 'Declined', numeric: true, render: (row) => formatCount(row.rejections) },
            { key: 'first', header: 'Decided first', numeric: true, render: (row) => formatCount(row.firstDecisions) },
            { key: 'avg', header: 'Average time', numeric: true, render: (row) => formatDuration(row.avgSeconds) },
            { key: 'median', header: 'Median time', numeric: true, render: (row) => formatDuration(row.medianSeconds) },
          ]}
        />
        <Table
          caption="Decisions by day"
          rows={vetting.decisionsByDay}
          getKey={(row) => row.day}
          empty="No decisions yet."
          columns={[
            { key: 'day', header: 'Day', rowHeader: true, render: (row) => formatDay(row.day) },
            { key: 'approvals', header: 'Approved', numeric: true, render: (row) => formatCount(row.approvals) },
            { key: 'rejections', header: 'Declined', numeric: true, render: (row) => formatCount(row.rejections) },
          ]}
        />
      </Panel>

      <Panel title="Why photos were declined" description="The reason is free text today, so these are the words reviewers wrote, counted. Counts by reason come with the fixed list of reasons (decision 244).">
        <Bars label="Reasons written for declines" rows={vetting.reasons.top} total={vetting.reasons.rejectionsWithReason} empty="No decline has a reason written." />
        <Note>
          {plural(vetting.reasons.rejectionsWithReason, 'decline')} with a reason, {formatCount(vetting.reasons.rejectionsWithoutReason)} without.
        </Note>
      </Panel>

      <Panel title="People marked in the photos" description="Who is in the picture, as the reviewers marked them at vetting: the mix of age and gender, the emotions and the merchandise.">
        {people.summary.photos > 0 ? <PeopleSummaryCard summary={people.summary} /> : <Note>No reviewer has marked the people in a photo yet.</Note>}
        <Table
          caption="Photos marked by person"
          rows={people.markers}
          getKey={(row) => row.id}
          empty="Nobody has marked the people in a photo yet."
          columns={[
            { key: 'by', header: 'Marked by', rowHeader: true, render: (row) => row.label },
            { key: 'photos', header: 'Photos', numeric: true, render: (row) => formatCount(row.count) },
          ]}
        />
      </Panel>
    </>
  );
}

export function ScreensSection({ report }: { report: EventReport }) {
  const { screens } = report;
  return (
    <>
      <Metrics
        items={[
          { label: 'Plays', value: formatCount(screens.plays), description: 'Photos shown on the giant screens, every time one appeared' },
          { label: 'Photos shown', value: formatCount(screens.photosShown), description: `${formatShare(screens.eligibleShown, screens.eligible)} of the ${plural(screens.eligible, 'photo')} the screens may show` },
          { label: 'Plays per shown photo', value: formatCount(screens.avgPlaysPerShownPhoto), description: `The most played photo was shown ${plural(screens.mostPlays, 'time')}` },
          { label: 'Last play', value: formatDateTime(screens.lastPlayedAt, report.options.timeZone), description: `On the clock of ${zoneName(report)}` },
        ]}
      />
      <Panel title="Plays by slideshow" description="Only a running count and the time of the last play are kept for each photo and slideshow, so plays per hour or per screen need the journey recording of phase 2.">
        <Table
          caption="Plays by slideshow"
          rows={screens.bySlideshow}
          getKey={(row) => row.id}
          empty="No slideshow has played a photo of this event."
          columns={[
            { key: 'name', header: 'Slideshow', rowHeader: true, render: (row) => row.name },
            { key: 'plays', header: 'Plays', numeric: true, render: (row) => formatCount(row.plays) },
            { key: 'photos', header: 'Photos shown', numeric: true, render: (row) => formatCount(row.photos) },
            { key: 'last', header: 'Last play', render: (row) => formatDateTime(row.lastPlayedAt, report.options.timeZone) },
          ]}
        />
      </Panel>
    </>
  );
}

export function SourcesSection({ sources, eventId }: { sources: SourcesReport; eventId: string }) {
  return (
    <>
      <Metrics
        items={[
          { label: 'Visits', value: formatCount(sources.totals.visits), description: 'People sent on through a link; one person who scans twice counts twice' },
          { label: 'Through QR codes', value: formatCount(sources.totals.qr), description: `${formatCount(sources.totals.iphone)} iPhone, ${formatCount(sources.totals.android)} Android, ${formatCount(sources.totals.other)} other (all links)` },
          { label: 'Through links', value: formatCount(sources.totals.link), description: "Including the event's own short address" },
        ]}
      />
      <Panel title="Visits by link" description="The tracked links of the event: the giant screen, a poster, an e-mail. Days are UTC days. A photo cannot be tied to the link that brought the user: the redirect does not pass it on.">
        <Table
          caption="Visits by link"
          rows={sources.rows}
          getKey={(row) => row.slug}
          empty="This event has no tracked link and its short address has no visit yet."
          columns={[
            { key: 'placement', header: 'Where', rowHeader: true, render: (row) => (row.active ? row.placement : `${row.placement} (switched off)`) },
            { key: 'kind', header: 'Kind', render: (row) => (row.kind === 'qr' ? 'QR code' : 'Link') },
            { key: 'visits', header: 'Visits', numeric: true, render: (row) => formatCount(row.visits) },
            { key: 'iphone', header: 'iPhone', numeric: true, render: (row) => formatCount(row.iphone) },
            { key: 'android', header: 'Android', numeric: true, render: (row) => formatCount(row.android) },
            { key: 'other', header: 'Other', numeric: true, render: (row) => formatCount(row.other) },
            { key: 'last', header: 'Last visit', render: (row) => (row.lastDay ? formatDay(row.lastDay) : 'n/a') },
          ]}
        />
        <Note>
          Links are made and switched off in the Short links panel on the <Link href={`/admin/events/${eventId}`}>event overview</Link>.
        </Note>
      </Panel>
      <Panel title="Visits per day">
        <Columns
          columns={sources.days.map((day) => ({ key: day.day, label: day.day.slice(8), full: formatDay(day.day), value: day.visits, title: `${formatDay(day.day)}: ${plural(day.visits, 'visit')}` }))}
          ariaLabel="Visits per day"
          summary={`${formatCount(sources.totals.visits)} visits in all.`}
          tickEvery={sources.days.length > 14 ? 3 : 1}
          unit="Visits"
          min={14}
        />
      </Panel>
    </>
  );
}

export function EmailsSection({ report }: { report: EventReport }) {
  const { emails, consents } = report;
  const rows = [
    { key: 'welcome', name: 'Welcome', sent: emails.welcome.sent, other: `${formatCount(emails.welcome.registrations)} registered`, note: 'When somebody registers at the Who-are-you step. Off unless the event switched it on.' },
    { key: 'arrived', name: 'Arrived', sent: emails.arrived.sent, other: 'n/a', note: 'When a photo is submitted. Off unless the event switched it on.' },
    {
      key: 'link',
      name: 'Photo link (approved)',
      sent: emails.photoLink.sent,
      other: `${formatCount(emails.photoLink.failed)} failed, ${formatCount(emails.photoLink.skipped)} skipped`,
      note: `${formatCount(emails.photoLink.byKind.afterSave)} after approval or saving, ${formatCount(emails.photoLink.byKind.relatedPhotos)} with related photos, ${formatCount(emails.photoLink.byKind.tryOnRerun)} for a new try-on result.`,
    },
    { key: 'declined', name: 'Declined', sent: emails.declined.sent, other: `${formatCount(emails.declined.notSent)} not sent`, note: 'When a reviewer declines a photo.' },
    { key: 'follow', name: 'Follow up', sent: 0, other: 'n/a', note: 'Not sent yet: the daily job that sends it is added later.' },
  ];
  return (
    <>
      <Panel title="E-mails sent" description="What the photos and registrations of the event record. A failed or skipped welcome or arrived e-mail leaves no trace, and nothing records opens, clicks or bounces.">
        <Table
          caption="E-mails by type"
          rows={rows}
          getKey={(row) => row.key}
          columns={[
            { key: 'name', header: 'E-mail', rowHeader: true, render: (row) => row.name },
            { key: 'sent', header: 'Sent', numeric: true, render: (row) => formatCount(row.sent) },
            { key: 'other', header: 'Other', render: (row) => row.other },
            { key: 'note', header: 'Note', render: (row) => row.note },
          ]}
        />
        {emails.photoLink.skippedBy.length > 0 ? (
          <>
            <strong style={{ fontSize: 'var(--mantine-font-size-sm)' }}>Why the photo link e-mail was skipped</strong>
            <Bars label="Reasons the photo link e-mail was skipped" rows={emails.photoLink.skippedBy} total={emails.photoLink.skipped} />
          </>
        ) : null}
      </Panel>

      <Panel title="Consents given" description="Each photo carries the consents the user accepted, with the exact words and the time. Only acceptances are stored: someone who leaves at the consent page leaves nothing.">
        <Metrics
          items={[
            { label: 'Photos with a consent', value: formatCount(consents.photosWithConsent), description: `${formatShare(consents.photosWithConsent, report.photos.taken)} of the photos taken` },
            { label: 'Photos with no consent record', value: formatCount(consents.photosWithoutConsent), description: 'Older photos, and photos of people who signed in before the fix of 9 October' },
            { label: 'Consent records', value: formatCount(consents.records), description: 'Acceptances in all (a photo can carry several)' },
            { label: 'Allowed in the public gallery', value: formatCount(consents.galleryConsent), description: 'The separate permission, kept as evidence' },
            { label: 'Allowed on the public wall', value: formatCount(consents.wallOptIn), description: "The user's choice at capture" },
          ]}
        />
        <Table
          caption="Consents by wording"
          rows={consents.byLabel}
          getKey={(row) => row.id}
          empty="No photo carries a consent record."
          columns={[
            { key: 'label', header: 'What the user accepted', rowHeader: true, render: (row) => row.label },
            { key: 'page', header: 'Page', render: (row) => (row.pageType === 'cta' ? 'Call to action' : 'Accept') },
            { key: 'count', header: 'Accepted', numeric: true, render: (row) => formatCount(row.count) },
            { key: 'first', header: 'First', render: (row) => formatDateTime(row.firstAt, report.options.timeZone) },
            { key: 'last', header: 'Last', render: (row) => formatDateTime(row.lastAt, report.options.timeZone) },
          ]}
        />
      </Panel>
    </>
  );
}
