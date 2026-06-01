'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import DataTable from '@/components/gds/DataTable';
import { StatusBadge, StateBlock } from '@doneisbetter/gds-core/client';
import { Button, Group, Stack, Text } from '@mantine/core';
import { getStatusBadgeProps, type CameraStatusTone } from '@/lib/gds/presentation';

export interface QueueRow {
  jobId: string;
  status: string;
  stage: string;
  createdAt: string;
  source: {
    submissionId: string;
    imageUrl: string;
    eventMongoId?: string | null;
  };
  request: {
    leatherSuitId: string;
  };
  processing: {
    workerId?: string | null;
    attemptCount: number;
    nextAttemptAt?: string | null;
  };
  result: {
    publicResultUrl?: string | null;
  };
  error?: {
    message?: string | null;
  };
}

function toneForStatus(status: string): CameraStatusTone {
  switch (status) {
    case 'done':
      return 'active';
    case 'failed':
      return 'danger';
    case 'retry_wait':
      return 'warning';
    case 'queued':
    case 'claimed':
    case 'processing':
    case 'uploading_result':
      return 'info';
    default:
      return 'inactive';
  }
}

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

async function retryJob(jobId: string) {
  const response = await fetch(`/api/admin/tryon-jobs/${jobId}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to retry try-on job');
  }
}

export default function TryOnQueueTable({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  async function handleRetry(jobId: string) {
    try {
      setBusyJobId(jobId);
      await retryJob(jobId);
      router.refresh();
    } finally {
      setBusyJobId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="No try-on jobs matched this filter"
        description="The queue is either empty or the current filter/search does not match any jobs."
      />
    );
  }

  return (
    <DataTable
      data={rows}
      columns={[
        {
          key: 'job',
          label: 'Job',
          render: (row: QueueRow) => (
            <>
              <Text fw={700}>{row.jobId}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Created {new Date(row.createdAt).toLocaleString()}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                Submission {row.source.submissionId}
              </Text>
            </>
          ),
        },
        {
          key: 'status',
          label: 'Status',
          render: (row: QueueRow) => (
            <>
              <Group gap="xs">
                <StatusBadge {...getStatusBadgeProps(toneForStatus(row.status), formatStatusLabel(row.status))} />
              </Group>
              <Text size="xs" c="dimmed" mt={8}>
                Stage: {formatStatusLabel(row.stage)}
              </Text>
              {row.error?.message ? (
                <Text size="xs" c="red.7" mt={8}>
                  {row.error.message}
                </Text>
              ) : null}
            </>
          ),
        },
        {
          key: 'source',
          label: 'Source',
          render: (row: QueueRow) => (
            <>
              <Text size="sm" lineClamp={2}>
                {row.source.imageUrl}
              </Text>
              {row.source.eventMongoId ? (
                <Text size="xs" c="dimmed" mt={4}>
                  Event {row.source.eventMongoId}
                </Text>
              ) : null}
            </>
          ),
        },
        {
          key: 'suit',
          label: 'Leather Jersey',
          render: (row: QueueRow) => <Text size="sm">{row.request.leatherSuitId}</Text>,
        },
        {
          key: 'worker',
          label: 'Worker',
          render: (row: QueueRow) => (
            <>
              <Text size="sm">{row.processing.workerId || 'Unclaimed'}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Attempts {row.processing.attemptCount}
              </Text>
              {row.processing.nextAttemptAt ? (
                <Text size="xs" c="dimmed" mt={4}>
                  Next {new Date(row.processing.nextAttemptAt).toLocaleString()}
                </Text>
              ) : null}
            </>
          ),
        },
        {
          key: 'result',
          label: 'Result',
          render: (row: QueueRow) => (
            <Stack gap="xs" align="flex-start">
              {row.result.publicResultUrl ? (
                <Text component="a" href={row.result.publicResultUrl} target="_blank" size="sm" c="blue.7">
                  Open result
                </Text>
              ) : (
                <Text size="sm" c="dimmed">
                  No result yet
                </Text>
              )}
              {(row.status === 'failed' || row.status === 'retry_wait') ? (
                <Button
                  variant="light"
                  size="xs"
                  loading={busyJobId === row.jobId}
                  aria-label={`Retry try-on job ${row.jobId}`}
                  onClick={() => void handleRetry(row.jobId)}
                >
                  Retry job
                </Button>
              ) : null}
            </Stack>
          ),
        },
      ]}
      getRowKey={(row) => row.jobId}
    />
  );
}
