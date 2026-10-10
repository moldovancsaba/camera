'use client';

/**
 * The Analytics view of an event or of all events (issue 521, phase 1, docs/ANALYTICS_AUDIT.md section 7.5): the filter, the tabs and the numbers of one tab. A pure function of the report it is
 * given (no data access, no state), so it is the same on the event's tab, on the all-events page and in the test harness. The tab is a link (`?view=`), so every tab can be shared.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCount, formatDateTime } from '@/lib/analytics/format';
import { analyticsHref, type AnalyticsQuery, type AnalyticsViewId } from '@/lib/analytics/query';
import type { EventReport, EventsTableRow } from '@/lib/analytics/report';
import type { SourcesReport } from '@/lib/analytics/sources';
import { REPORT_TIME_ZONES } from '@/lib/analytics/time';
import AnalyticsFilterForm from './AnalyticsFilterForm';
import { EmailsSection, OverviewSection, PhotosSection, ScreensSection, SourcesSection, VettingSection } from './sections';
import { Note } from './ui';

interface TabDefinition {
  id: AnalyticsViewId;
  label: string;
}

const TABS: TabDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'photos', label: 'Photos and users' },
  { id: 'vetting', label: 'Vetting and people' },
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
  /** One row per event, on the all-events page. */
  table?: EventsTableRow[];
  /** The event's Mongo id, for the link back to its overview. */
  eventMongoId?: string;
  /** The address of the CSV of the whole view with the same days and clock; absent on the all-events page. */
  exportHref?: string;
  /** The Messmass tab is offered (global admins, one event); its content is given only while that tab is open, so the numbers are not computed otherwise. */
  showMessmass?: boolean;
  messmass?: ReactNode;
}

export default function AnalyticsView({ basePath, query, defaultTimeZone, report, sources, table, eventMongoId, exportHref, showMessmass, messmass }: AnalyticsViewProps) {
  const tabs = TABS.filter((tab) => (tab.id === 'sources' ? Boolean(sources) : tab.id === 'messmass' ? Boolean(showMessmass) : true));
  const active: AnalyticsViewId = tabs.some((tab) => tab.id === query.view) ? query.view : 'overview';
  const { scope } = report;
  const href = (overrides: Partial<AnalyticsQuery>) => analyticsHref(basePath, query, overrides, defaultTimeZone);

  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-lg)', gridTemplateColumns: 'minmax(0, 1fr)' }} data-analytics-view={active}>
      <AnalyticsFilterForm query={{ ...query, view: active }} clearHref={analyticsHref(basePath, { ...query, from: '', to: '' }, { view: active }, defaultTimeZone)} />

      <Note>
        {scope.counted === 0
          ? 'No photo is filed under this event in this period.'
          : `Counting ${formatCount(scope.counted)} photos (${formatCount(report.photos.taken)} taken by users, ${formatCount(scope.addedByEditors)} added by editors), from ${formatDateTime(scope.firstPhotoAt, report.options.timeZone)} to ${formatDateTime(scope.lastPhotoAt, report.options.timeZone)}.`}
        {scope.removed + scope.brokenPictures > 0 ? ` Left out: ${formatCount(scope.removed)} removed from the event and ${formatCount(scope.brokenPictures)} whose picture is gone.` : ''} Times are on the clock of {REPORT_TIME_ZONES.find((zone) => zone.id === report.options.timeZone)?.label ?? report.options.timeZone}. Try-on results are not photos of this report.
      </Note>

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
      {active === 'photos' ? <PhotosSection report={report} /> : null}
      {active === 'vetting' ? <VettingSection report={report} /> : null}
      {active === 'screens' ? <ScreensSection report={report} /> : null}
      {active === 'sources' && sources ? <SourcesSection sources={sources} eventId={eventMongoId ?? ''} /> : null}
      {active === 'emails' ? <EmailsSection report={report} /> : null}
      {active === 'messmass' ? messmass ?? null : null}
    </div>
  );
}
