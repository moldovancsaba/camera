'use client';

import { Stack, Text, Title } from '@mantine/core';
import DataTable from '@/components/gds/DataTable';
import type {
  TryOnAnalyticsRow,
  TryOnPresetPerformanceRow,
} from '@/lib/tryon/analytics';

function AnalyticsTable({ title, rows }: { title: string; rows: TryOnAnalyticsRow[] }) {
  return (
    <Stack gap="sm">
      <Title order={3}>{title}</Title>
      {rows.length > 0 ? (
        <DataTable
          data={rows}
          getRowKey={(row) => row.key}
          columns={[
            { key: 'label', label: 'Name' },
            { key: 'total', label: 'Total' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'service', label: 'Service' },
            { key: 'greatest', label: 'Greatest' },
          ]}
        />
      ) : (
        <Text c="dimmed">No try-on decisions match this filter.</Text>
      )}
    </Stack>
  );
}

function PresetPerformanceTable({ rows }: { rows: TryOnPresetPerformanceRow[] }) {
  return (
    <Stack gap="sm">
      <Title order={3}>Preset Performance</Title>
      {rows.length > 0 ? (
        <DataTable
          data={rows}
          getRowKey={(row) => row.setupId}
          columns={[
            { key: 'setupName', label: 'Preset' },
            { key: 'jobs', label: 'Jobs' },
            { key: 'done', label: 'Done' },
            { key: 'failed', label: 'Failed' },
            { key: 'retryWait', label: 'Retry' },
            { key: 'providerTimeouts', label: 'Timeouts' },
            { key: 'approved', label: 'Approved' },
            { key: 'rejected', label: 'Rejected' },
            { key: 'service', label: 'Service' },
            { key: 'great', label: 'Great' },
            { key: 'approvalRate', label: 'Approval Rate', render: (row) => `${row.approvalRate}%` },
          ]}
        />
      ) : (
        <Text c="dimmed">No preset performance data matches this filter.</Text>
      )}
    </Stack>
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
