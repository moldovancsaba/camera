'use client';

import { AdminAnalyticsTable } from '@doneisbetter/gds-admin/client';
import type {
  TryOnAnalyticsRow,
  TryOnPresetPerformanceRow,
} from '@/lib/tryon/analytics';

function AnalyticsTable({ title, rows }: { title: string; rows: TryOnAnalyticsRow[] }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {rows.length > 0 ? (
        <AdminAnalyticsTable<TryOnAnalyticsRow & Record<string, unknown>>
          rows={rows as Array<TryOnAnalyticsRow & Record<string, unknown>>}
          getRowKey={(row) => row.key}
          columns={[
            { key: 'label', header: 'Name', accessor: (row) => row.label, rowHeader: true },
            { key: 'total', header: 'Total', accessor: (row) => row.total, numeric: true },
            { key: 'approved', header: 'Approved', accessor: (row) => row.approved, numeric: true, metricTone: 'positive' },
            { key: 'rejected', header: 'Rejected', accessor: (row) => row.rejected, numeric: true, metricTone: 'negative' },
            { key: 'service', header: 'Service', accessor: (row) => row.service, numeric: true, metricTone: 'warning' },
            { key: 'greatest', header: 'Greatest', accessor: (row) => row.greatest, numeric: true, metricTone: 'positive' },
          ]}
        />
      ) : (
        <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0 }}>No try-on decisions match this filter.</p>
      )}
    </section>
  );
}

function PresetPerformanceTable({ rows }: { rows: TryOnPresetPerformanceRow[] }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)' }}>
      <h3 style={{ margin: 0 }}>Preset Performance</h3>
      {rows.length > 0 ? (
        <AdminAnalyticsTable<TryOnPresetPerformanceRow & Record<string, unknown>>
          rows={rows as Array<TryOnPresetPerformanceRow & Record<string, unknown>>}
          getRowKey={(row) => row.setupId}
          columns={[
            { key: 'setupName', header: 'Preset', accessor: (row) => row.setupName, rowHeader: true },
            { key: 'jobs', header: 'Jobs', accessor: (row) => row.jobs, numeric: true },
            { key: 'done', header: 'Done', accessor: (row) => row.done, numeric: true, metricTone: 'positive' },
            { key: 'failed', header: 'Failed', accessor: (row) => row.failed, numeric: true, metricTone: 'negative' },
            { key: 'retryWait', header: 'Retry', accessor: (row) => row.retryWait, numeric: true, metricTone: 'warning' },
            { key: 'providerTimeouts', header: 'Timeouts', accessor: (row) => row.providerTimeouts, numeric: true, metricTone: 'warning' },
            { key: 'approved', header: 'Approved', accessor: (row) => row.approved, numeric: true, metricTone: 'positive' },
            { key: 'rejected', header: 'Rejected', accessor: (row) => row.rejected, numeric: true, metricTone: 'negative' },
            { key: 'service', header: 'Service', accessor: (row) => row.service, numeric: true, metricTone: 'warning' },
            { key: 'great', header: 'Great', accessor: (row) => row.great, numeric: true, metricTone: 'positive' },
            { key: 'approvalRate', header: 'Approval Rate', accessor: (row) => `${row.approvalRate}%`, numeric: true },
          ]}
        />
      ) : (
        <p style={{ color: 'var(--mantine-color-dimmed)', margin: 0 }}>No preset performance data matches this filter.</p>
      )}
    </section>
  );
}

export default function TryOnAnalyticsTables({
  byPreset,
  byGarment,
  byEvent,
  presetPerformance,
}: {
  byPreset: TryOnAnalyticsRow[];
  byGarment: TryOnAnalyticsRow[];
  byEvent: TryOnAnalyticsRow[];
  presetPerformance: TryOnPresetPerformanceRow[];
}) {
  return (
    <>
      <PresetPerformanceTable rows={presetPerformance} />
      <AnalyticsTable title="By Preset" rows={byPreset} />
      <AnalyticsTable title="By Garment" rows={byGarment} />
      <AnalyticsTable title="By Event" rows={byEvent} />
    </>
  );
}
