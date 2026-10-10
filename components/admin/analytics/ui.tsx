'use client';

/**
 * The small pieces the Analytics view is made of (issue 521): a panel, a row of metric cards, a list of bars, a column chart with its table, a table and a note. The panel, the metric card and
 * the table are the design system's (`SectionPanel`, `MetricCard`, `AdminAnalyticsTable`); the bars and columns are drawn here from `--mantine-*` colour variables, because the design system's
 * bar chart always prints its whole data table under the chart (24 hours made a page of it) and has no column form. Every chart has a text summary for a screen reader and its numbers in a table.
 */

import type { ReactNode } from 'react';
import { MetricCard, SectionPanel } from '@sovereignsquad/gds-core/client';
import { AdminAnalyticsTable } from '@sovereignsquad/gds-admin/client';
import { formatCount, formatShare } from '@/lib/analytics/format';

export const MUTED = { color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-sm)', margin: 0 } as const;

export function Panel({ title, description, children, id }: { title: string; description?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <SectionPanel title={title} description={description} id={id}>
      <div style={{ display: 'grid', gap: 'var(--mantine-spacing-md)', gridTemplateColumns: 'minmax(0, 1fr)' }}>{children}</div>
    </SectionPanel>
  );
}

export interface Metric {
  label: string;
  value: ReactNode;
  description?: ReactNode;
}

export function Metrics({ items }: { items: Metric[] }) {
  return (
    <div data-analytics-metrics style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))' }}>
      {items.map((item) => (
        <MetricCard key={item.label} label={item.label} value={item.value} description={item.description} />
      ))}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p style={MUTED}>{children}</p>;
}

export interface BarRow {
  id: string;
  label: string;
  count: number;
}

/**
 * A list of bars, one row each: the label, a bar as long as the count is of the largest, the count and, when a whole is given, its share. Rows with a zero count stay (a zero is information),
 * the bar is one colour (the rows are one measure), and the numbers are always written.
 */
export function Bars({ rows, total, label, empty = 'Nothing yet.' }: { rows: BarRow[]; total?: number; label: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0 || rows.every((row) => row.count === 0 && total === undefined)) return <Note>{empty}</Note>;
  return (
    <div role="list" aria-label={label} style={{ display: 'grid', gap: '0.5rem' }}>
      {rows.map((row) => (
        <div key={row.id} role="listitem" style={{ alignItems: 'center', display: 'grid', gap: '0.25rem 0.75rem', gridTemplateColumns: 'minmax(7rem, 1fr) minmax(0, 2fr) auto' }}>
          <span style={{ fontSize: 'var(--mantine-font-size-sm)', overflowWrap: 'anywhere' }}>{row.label}</span>
          <div style={{ background: 'var(--mantine-color-default-hover)', borderRadius: 999, height: 10, overflow: 'hidden' }}>
            <div style={{ background: 'var(--mantine-primary-color-filled)', borderRadius: 999, height: '100%', width: `${(row.count / max) * 100}%` }} />
          </div>
          <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-sm)', textAlign: 'right', whiteSpace: 'nowrap' }}>
            {formatCount(row.count)}
            {total !== undefined ? ` (${formatShare(row.count, total)})` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface Column {
  key: string;
  /** The short axis label ("16" or "20"). */
  label: string;
  /** The whole name of the time ("Fri 16 Oct", "20:00"), for the table. */
  full: string;
  value: number;
  /** The words of the tooltip, "Fri 16 Oct: 12 photos". */
  title: string;
}

/**
 * Columns along a time axis (days, hours): one thin column each from a common baseline, the tallest one named with its number, a few axis labels (`tickEvery`), and the same numbers in a table
 * one click away. Scrolls sideways when there are many days, never the page.
 */
export function Columns({ columns, ariaLabel, summary, tickEvery, unit, min = 10 }: { columns: Column[]; ariaLabel: string; summary: string; tickEvery: number; unit: string; min?: number }) {
  const max = Math.max(1, ...columns.map((column) => column.value));
  const top = columns.reduce((best, column, index) => (column.value > (columns[best]?.value ?? -1) ? index : best), 0);
  if (columns.length === 0 || columns.every((column) => column.value === 0)) return <Note>No photos in this period.</Note>;
  return (
    <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
      <div style={{ overflowX: 'auto' }}>
        <div role="img" aria-label={`${ariaLabel}. ${summary}`} data-columns style={{ alignItems: 'end', display: 'flex', gap: 3, height: 150, minWidth: columns.length * (min + 3) }}>
          {columns.map((column, index) => (
            <div key={column.key} title={column.title} style={{ alignItems: 'center', display: 'flex', flex: `1 1 ${min}px`, flexDirection: 'column', height: '100%', justifyContent: 'flex-end', maxWidth: 64, minWidth: min }}>
              {index === top ? <span style={{ fontSize: 'var(--mantine-font-size-xs)', fontWeight: 600 }}>{formatCount(column.value)}</span> : null}
              <div style={{ background: 'var(--mantine-primary-color-filled)', borderRadius: '4px 4px 0 0', height: column.value > 0 ? `${Math.max(2, (column.value / max) * 100 - (index === top ? 12 : 0))}%` : 0, width: '100%' }} />
            </div>
          ))}
        </div>
        <div aria-hidden style={{ borderTop: '1px solid var(--mantine-color-default-border)', display: 'flex', gap: 3, minWidth: columns.length * (min + 3), paddingTop: 4 }}>
          {columns.map((column, index) => (
            <span key={column.key} style={{ color: 'var(--mantine-color-dimmed)', flex: `1 1 ${min}px`, fontSize: 'var(--mantine-font-size-xs)', maxWidth: 64, minWidth: min, overflow: 'visible', textAlign: 'center', whiteSpace: 'nowrap' }}>
              {index % tickEvery === 0 ? column.label : ''}
            </span>
          ))}
        </div>
      </div>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 'var(--mantine-font-size-sm)' }}>Show the numbers as a table</summary>
        <div style={{ marginTop: 'var(--mantine-spacing-xs)' }}>
          <Table caption={ariaLabel} rows={columns} getKey={(column) => column.key} columns={[{ key: 'label', header: 'Time', render: (column) => column.full, rowHeader: true }, { key: 'value', header: unit, render: (column) => formatCount(column.value), numeric: true }]} />
        </div>
      </details>
    </div>
  );
}

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  rowHeader?: boolean;
}

/** The design system's analytics table: right-aligned numbers, a caption, an empty message. */
export function Table<T>({ rows, columns, getKey, caption, empty = 'Nothing yet.' }: { rows: T[]; columns: TableColumn<T>[]; getKey: (row: T) => string; caption: string; empty?: string }) {
  // A table wider than the screen scrolls inside its own box, never the page.
  return (
    <div style={{ maxWidth: '100%', minWidth: 0, overflowX: 'auto' }}>
      <AdminAnalyticsTable<T & Record<string, unknown>>
        rows={rows as Array<T & Record<string, unknown>>}
        getRowKey={(row) => getKey(row as T)}
        caption={caption}
        empty={empty}
        columns={columns.map((column) => ({ key: column.key, header: column.header, accessor: (row) => column.render(row as T), numeric: column.numeric, rowHeader: column.rowHeader }))}
      />
    </div>
  );
}
