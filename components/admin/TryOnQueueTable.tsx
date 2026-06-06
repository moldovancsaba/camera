'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataTable from '@/components/gds/DataTable';
import { StatusBadge, StateBlock } from '@doneisbetter/gds-core/client';
import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { getStatusBadgeProps, type CameraStatusTone } from '@/lib/gds/presentation';
import type { TryOnSetup } from '@/lib/tryon/setup-resolution';

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
    setupId?: string | null;
  };
  processing: {
    workerId?: string | null;
    attemptCount: number;
    nextAttemptAt?: string | null;
    resolvedSetup?: {
      setupId: string;
      setupName: string;
    };
  };
  result: {
    publicResultUrl?: string | null;
  };
  error?: {
    code?: string | null;
    message?: string | null;
  };
}

interface TryOnQueueTableProps {
  rows: QueueRow[];
  setupOptions?: TryOnSetup[];
  totalCount?: number;
  statusFilter?: string;
  search?: string;
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

async function rerunJob(jobId: string, setupId?: string) {
  const payload = setupId ? { setupId } : {};
  const response = await fetch(`/api/admin/tryon-jobs/${jobId}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responsePayload.error || 'Failed to rerun try-on job');
  }
}

async function reapplyResult(jobId: string) {
  const response = await fetch(`/api/admin/tryon-jobs/${jobId}/reapply-result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to resend try-on result');
  }
}

function makeSetupDisplayMap(setups: TryOnSetup[]) {
  return new Map(setups.map((setup) => [setup.setupId, setup.name]));
}

function getSetupLabel(
  setupsById: Map<string, string>,
  setup?: {
    setupId: string;
    setupName?: string | null;
  } | null
): string {
  if (!setup) return 'Unknown preset';
  if (setup.setupName && setup.setupName.trim().length > 0) {
    return setup.setupName;
  }
  return setupsById.get(setup.setupId) ?? setup.setupId;
}

function toQueueRow(value: unknown): QueueRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<QueueRow>;
  if (typeof row.jobId !== 'string' || typeof row.status !== 'string' || typeof row.stage !== 'string') return null;

  return {
    jobId: row.jobId,
    status: row.status,
    stage: row.stage,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    source: {
      submissionId: typeof row.source?.submissionId === 'string' ? row.source.submissionId : 'unknown',
      imageUrl: typeof row.source?.imageUrl === 'string' ? row.source.imageUrl : '',
      eventMongoId: typeof row.source?.eventMongoId === 'string' ? row.source.eventMongoId : null,
    },
    request: {
      leatherSuitId: typeof row.request?.leatherSuitId === 'string' ? row.request.leatherSuitId : 'unknown',
      setupId: typeof row.request?.setupId === 'string' ? row.request.setupId : null,
    },
    processing: {
      workerId: typeof row.processing?.workerId === 'string' ? row.processing.workerId : null,
      attemptCount: typeof row.processing?.attemptCount === 'number' ? row.processing.attemptCount : 0,
      nextAttemptAt: typeof row.processing?.nextAttemptAt === 'string' ? row.processing.nextAttemptAt : null,
      resolvedSetup:
        typeof row.processing?.resolvedSetup?.setupId === 'string' &&
        typeof row.processing.resolvedSetup.setupName === 'string'
          ? row.processing.resolvedSetup
          : undefined,
    },
    result: {
      publicResultUrl: typeof row.result?.publicResultUrl === 'string' ? row.result.publicResultUrl : null,
    },
    error: {
      code: typeof row.error?.code === 'string' ? row.error.code : null,
      message: typeof row.error?.message === 'string' ? row.error.message : null,
    },
  };
}

export default function TryOnQueueTable({
  rows,
  setupOptions = [],
  totalCount = rows.length,
  statusFilter = '',
  search = '',
}: TryOnQueueTableProps) {
  const router = useRouter();
  const [displayRows, setDisplayRows] = useState(rows);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [selectedSetupByJob, setSelectedSetupByJob] = useState<Record<string, string>>({});
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const setupsById = useMemo(() => makeSetupDisplayMap(setupOptions), [setupOptions]);
  const defaultSetupId = setupOptions[0]?.setupId ?? '';
  const hasMore = displayRows.length < totalCount;

  useEffect(() => {
    setDisplayRows(rows);
  }, [rows]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        offset: String(displayRows.length),
        limit: '100',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const response = await fetch(`/api/admin/tryon-jobs?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.data?.jobs)) return;

      const nextRows = payload.data.jobs
        .map((value: unknown) => toQueueRow(value))
        .filter((value: QueueRow | null): value is QueueRow => Boolean(value));

      setDisplayRows((current) => {
        const knownIds = new Set(current.map((row) => row.jobId));
        return [...current, ...nextRows.filter((row: QueueRow) => !knownIds.has(row.jobId))];
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [displayRows.length, hasMore, isLoadingMore, search, statusFilter]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMore();
      }
    }, { rootMargin: '600px 0px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  async function handleRetry(jobId: string) {
    try {
      setBusyJobId(jobId);
      await retryJob(jobId);
      router.refresh();
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleRerun(jobId: string, setupId?: string) {
    try {
      setBusyJobId(jobId);
      await rerunJob(jobId, setupId);
      router.refresh();
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleReapplyResult(jobId: string) {
    try {
      setBusyJobId(jobId);
      await reapplyResult(jobId);
      router.refresh();
    } finally {
      setBusyJobId(null);
    }
  }

  if (displayRows.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title="No try-on jobs matched this filter"
        description="The queue is either empty or the current filter/search does not match any jobs."
      />
    );
  }

  return (
    <Stack gap="md">
      <DataTable
      data={displayRows}
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
                <Stack gap={2} mt={8}>
                  {row.error.code ? (
                    <Text size="xs" fw={700}>
                      {formatStatusLabel(row.error.code)}
                    </Text>
                  ) : null}
                  <Text size="xs">
                    {row.error.message}
                  </Text>
                </Stack>
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
          label: 'Garment',
          render: (row: QueueRow) => <Text size="sm">{row.request.leatherSuitId}</Text>,
        },
        {
          key: 'preset',
          label: 'Preset',
          render: (row: QueueRow) => {
            const setupForDisplay = row.processing.resolvedSetup
              ? {
                  setupId: row.processing.resolvedSetup.setupId,
                  setupName: row.processing.resolvedSetup.setupName,
                }
              : typeof row.request.setupId === 'string'
                ? { setupId: row.request.setupId }
                : null;
            return <Text size="sm">{getSetupLabel(setupsById, setupForDisplay)}</Text>;
          },
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
                <Text component="a" href={row.result.publicResultUrl} target="_blank" size="sm">
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
              {(row.status === 'failed' || row.status === 'retry_wait' || row.status === 'done') ? (
                <Stack gap="xs">
                  {(() => {
                    const selectedSetupId =
                      selectedSetupByJob[row.jobId] ??
                      (row.processing.resolvedSetup?.setupId ??
                        (row.request.setupId && setupOptions.some((setup) => setup.setupId === row.request.setupId)
                          ? row.request.setupId
                          : defaultSetupId));
                    return (
                      <>
                        {setupOptions.length > 0 ? (
                          <Select
                            label="Try-on preset"
                            data={setupOptions.map((setup) => ({
                              value: setup.setupId,
                              label: `${setup.name}${setup.isDefault ? ' (default)' : ''}`,
                            }))}
                            value={selectedSetupId}
                            onChange={(nextSetupId) => {
                              if (typeof nextSetupId === 'string') {
                                setSelectedSetupByJob((state) => ({ ...state, [row.jobId]: nextSetupId }));
                              }
                            }}
                            size="xs"
                            checkIconPosition="left"
                            disabled={busyJobId === row.jobId}
                          />
                        ) : (
                          <Text size="xs" c="dimmed">
                            Preset list unavailable
                          </Text>
                        )}
                        <Button
                          variant="outline"
                          size="xs"
                          loading={busyJobId === row.jobId}
                          aria-label={`Rerun try-on job ${row.jobId}`}
                          onClick={() => void handleRerun(row.jobId, selectedSetupId)}
                        >
                          Rerun job
                        </Button>
                      </>
                    );
                  })()}
                </Stack>
              ) : null}
              {(row.status === 'done' && Boolean(row.result.publicResultUrl)) ? (
                <Button
                  variant="default"
                  size="xs"
                  loading={busyJobId === row.jobId}
                  aria-label={`Re-send try-on result ${row.jobId}`}
                  onClick={() => void handleReapplyResult(row.jobId)}
                >
                  Resend to user
                </Button>
              ) : null}
            </Stack>
          ),
        },
      ]}
      getRowKey={(row) => row.jobId}
      />
      {hasMore ? (
        <div ref={sentinelRef}>
          <StateBlock
            variant="loading"
            title={isLoadingMore ? 'Loading more jobs...' : 'Scroll to load more jobs'}
            description={`${displayRows.length} of ${totalCount} matching jobs loaded.`}
          />
        </div>
      ) : (
        <Text size="sm" c="dimmed" ta="center">
          All {totalCount} matching jobs loaded.
        </Text>
      )}
    </Stack>
  );
}
