'use client';

/**
 * The Analytics view of an event or of all events (issue 521, phase 1, docs/ANALYTICS_AUDIT.md section 7.5): the filter, the tabs and the numbers of one tab. A pure function of the report it is
 * given (no data access, no state), so it is the same on the event's tab, on the all-events page and in the test harness. The tab is a link (`?view=`), so every tab can be shared.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCount, formatDateTime } from '@/lib/analytics/format';
import { analyticsHref, type AnalyticsQuery, type AnalyticsViewId } from '@/lib/analytics/query';
import type { JourneySummary } from '@/lib/analytics/journey';
import type { EventReport, EventsTableRow } from '@/lib/analytics/report';
import type { SourcesReport } from '@/lib/analytics/sources';
import { REPORT_TIME_ZONES } from '@/lib/analytics/time';
import AnalyticsFilterForm from './AnalyticsFilterForm';
import JourneySection, { type JourneySettingState } from './JourneySection';
import { EmailsSection, OverviewSection, PhotosSection, ScreensSection, SourcesSection, VettingSection } from './sections';
import { Metrics, Note, Panel } from './ui';

interface TabDefinition {
  id: AnalyticsViewId;
  label: string;
}

const TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'journey', label: 'Journey' },
  { id: 'photos', label: 'Photos and users' },
  { id: 'vetting', label: 'Vetting' },
  { id: 'screens', label: 'Screens' },
  { id: 'sources', label: 'Sources' },
  { id: 'emails', label: 'E-mails and consent' },
  { id: 'messmass', label: 'Messmass' },
];

export interface AnalyticsViewProps {
  basePath: string;
  query: AnalyticsQuery;
  defaultTimeZone: string;
  report: EventReport;
  /** The tracked links of the event; absent on the all-events page (the Sources tab is then not offered). */
  sources?: SourcesReport;
  /** The journey recording of the event and the state of its kill switch (issue 521, phase 2); absent on the all-events page (the Journey tab is then not offered). */
  journey?: JourneySummary;
  journeySetting?: JourneySettingState;
  /** One row per event, on the all-events page. */
  table?: EventsTableRow[];
  /** The event's Mongo id, for the link back to its overview. */
  eventMongoId?: string;
  /** The address of the CSV of the whole view with the same days and clock; absent on the all-events page. */
  exportHref?: string;
  /** The Messmass tab is offered (global admins, one event); its content is given only while that tab is open, so the numbers are not computed otherwise. */
  showMessmass?: boolean;
  messmass?: ReactNode;
  /** Cross-event repeat cohort is sent only by the global-admin all-events page as an aggregate. */
  crossEventReturning?: { returning: number; identifiable: number; share: number | null };
}

export default function AnalyticsView({ basePath, query, defaultTimeZone, report, sources, journey, journeySetting, table, eventMongoId, exportHref, showMessmass, messmass, crossEventReturning }: AnalyticsViewProps) {
  const tabs = TABS.filter((tab) => (tab.id === 'sources' ? Boolean(sources) : tab.id === 'journey' ? Boolean(journey && journeySetting) : tab.id === 'messmass' ? Boolean(showMessmass) : true));
  const active: AnalyticsViewId = tabs.some((tab) => tab.id === query.view) ? query.view : 'overview';
  const { scope } = report;
  const href = (overrides: Partial<AnalyticsQuery>) => analyticsHref(basePath, query, overrides, defaultTimeZone);

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-lg)', gridTemplateColumns: 'minmax(0, 1fr)' }} data-analytics-view={active}>
      <AnalyticsFilterForm query={{ ...query, view: active }} clearHref={analyticsHref(basePath, { ...query, from: '', to: '' }, { view: active }, defaultTimeZone)} />

      <Note>
        {scope.counted === 0
          ? 'No active photo is filed under this event in this period.'
          : `Counting ${formatCount(scope.counted)} photos (${formatCount(report.photos.taken)} taken by users, ${formatCount(scope.addedByEditors)} added by editors), from ${formatDateTime(scope.firstPhotoAt, report.options.timeZone)} to ${formatDateTime(scope.lastPhotoAt, report.options.timeZone)}.`}
        {scope.removed + scope.brokenPictures + scope.deletedAutomaticallyNoLogin + scope.deletedAutomaticallyOther + scope.deletedManually > 0 ? ` Outcomes also include ${formatCount(scope.deletedAutomaticallyNoLogin)} automatically deleted without a user, ${formatCount(scope.deletedAutomaticallyOther)} automatically deleted with a registered identity, and ${formatCount(scope.deletedManually)} manually deleted; ${formatCount(scope.brokenPictures)} more have a missing picture.` : ''} Times are on the clock of {REPORT_TIME_ZONES.find((zone) => zone.id === report.options.timeZone)?.label ?? report.options.timeZone}. Try-on results are not photos of this report.
      </Note>
      {crossEventReturning ? (
        <Panel title="Returning users across events" description="Aggregate only. Users active in the selected period are counted as returning if their existing photo records show activity in more than one event. Matching is done in memory; no identity key is stored in a cross-event profile or appears in this report.">
          <Metrics items={[{ label: 'Returning across events', value: formatCount(crossEventReturning.returning), description: `${formatCount(crossEventReturning.identifiable)} identifiable active users · ${crossEventReturning.share === null ? 'n/a' : `${Math.round(crossEventReturning.share * 100)}%`}` }]} />
        </Panel>
      ) : null}

      <nav aria-label="Analytics sections" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={href({ view: tab.id })}
              aria-current={current ? 'page' : undefined}
              style={{
                borderRadius: 8,
                color: current ? 'var(--mantine-color-blue-7)' : 'var(--mantine-color-dimmed)',
                fontSize: '0.875rem',
                fontWeight: current ? 700 : 500,
                padding: '0.4rem 0.75rem',
                textDecoration: 'none',
                background: current ? 'var(--mantine-color-blue-0)' : 'transparent',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {exportHref ? (
        <div style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          <a href={exportHref} download>
            Download the figures of every tab as a CSV file
          </a>{' '}
          <span style={{ color: 'var(--mantine-color-dimmed)' }}>(the days and the clock chosen above)</span>
        </div>
      ) : null}

      {active === 'overview' ? <OverviewSection report={report} sources={sources} table={table} /> : null}
      {active === 'journey' && journey && journeySetting ? <JourneySection journey={journey} setting={journeySetting} timeZone={report.options.timeZone} /> : null}
      {active === 'photos' ? <PhotosSection report={report} /> : null}
      {active === 'vetting' ? <VettingSection report={report} /> : null}
      {active === 'screens' ? <ScreensSection report={report} /> : null}
      {active === 'sources' && sources ? <SourcesSection sources={sources} eventId={eventMongoId ?? ''} /> : null}
      {active === 'emails' ? <EmailsSection report={report} /> : null}
      {active === 'messmass' ? messmass ?? null : null}
    </div>
  );
}
