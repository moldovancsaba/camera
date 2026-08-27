'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '@sovereignsquad/gds-admin/client';
import { StatusBadge, StateBlock, useGdsConfirm } from '@sovereignsquad/gds-core/client';
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
    // Resolved server-side from eventMongoId; the raw hex is unreadable.
    eventName?: string | null;
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
  // Set when this job is a rerun whose predecessor's result was archived
  // (superseded) the moment the rerun was requested, and the rerun then
  // failed -- leaving that result hidden with nothing to replace it.
  orphanedResultSubmissionId?: string | null;
}

type QueueTableRow = QueueRow & Record<string, unknown>;

interface TryOnQueueTableProps {
  rows: QueueRow[];
  setupOptions?: TryOnSetup[];
  totalCount?: number;
  statusFilter?: string;
  search?: string;
  eventId?: string;
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
  return payload.data?.message || payload.message || 'Job queued for retry.';
}

async function rerunJob(jobId: string, setupId?: string, sourceImageData?: string) {
  const payload: Record<string, string> = {};
  if (setupId) payload.setupId = setupId;
  if (sourceImageData) payload.sourceImageData = sourceImageData;
  const response = await fetch(`/api/admin/tryon-jobs/${jobId}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responsePayload.error || 'Failed to rerun try-on job');
  }
  return responsePayload.data?.message || responsePayload.message || 'New rerun job queued.';
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
  return payload.data?.message || payload.message || 'Result reapplied.';
}

async function restoreOrphanedResult(submissionId: string) {
  const response = await fetch(`/api/admin/tryon-results/${submissionId}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to restore result');
  }
  return 'Prior result restored to Vetting for review.';
}

function recoveryHint(row: QueueRow): string {
  if (row.status === 'failed') {
    return 'Retry keeps the same job/settings. Rerun creates a new job when quality or settings need to change.';
  }
  if (row.status === 'retry_wait') {
    return 'Retry now bypasses the wait timer and returns the job to queued.';
  }
  if (row.status === 'done' && row.result.publicResultUrl) {
    return 'Reapply repairs result/publication links from the completed output. It does not bypass human approval.';
  }
  return 'No recovery action is available for this state.';
}

function SourceImagePreview({ row }: { row: QueueRow }) {
  // WHY the error state: imgbb deletes uploads without notice, so a failed
  // job's source URL often 404s. A silent broken-image icon reads as a UI
  // bug; naming the situation points the operator at "Replace photo & rerun".
  const [unreachable, setUnreachable] = useState(false);
  const imageUrl = row.source.imageUrl.trim();
  if (!imageUrl) {
    return (
      <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem' }}>
        No source image
      </span>
    );
  }

  if (unreachable) {
    return (
      <div
        style={{
          border: '1px dashed var(--gds-color-border)',
          borderRadius: 12,
          display: 'grid',
          gap: '0.35rem',
          maxWidth: 240,
          padding: '0.75rem',
        }}
      >
        <strong style={{ fontSize: '0.75rem' }}>Source image unreachable</strong>
        <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
          The host no longer serves this file (deleted or expired upload). Use
          &ldquo;Replace photo &amp; rerun&rdquo; to upload it again.
        </span>
        <a href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem' }}>
          Open original URL
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '0.5rem' }}>
      <div
        style={{
          background: 'var(--gds-color-surface-muted)',
          border: '1px solid var(--gds-color-border)',
          borderRadius: 12,
          height: 132,
          overflow: 'hidden',
          position: 'relative',
          width: 96,
        }}
      >
        <Image
          src={imageUrl}
          alt={`Original source image for job ${row.jobId}`}
          fill
          sizes="96px"
          style={{ objectFit: 'contain' }}
          unoptimized
          onError={() => setUnreachable(true)}
        />
      </div>
      <a href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem' }}>
        Open original
      </a>
    </div>
  );
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
  eventId = '',
}: TryOnQueueTableProps) {
  const router = useRouter();
  const { confirm } = useGdsConfirm();
  const [displayRows, setDisplayRows] = useState(rows);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
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
      if (eventId) params.set('eventId', eventId);

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
  }, [displayRows.length, eventId, hasMore, isLoadingMore, search, statusFilter]);

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
      setRecoveryMessage(await retryJob(jobId));
      router.refresh();
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleRerun(jobId: string, setupId?: string) {
    const confirmed = await confirm({
      title: 'Rerun try-on job',
      message:
        'Rerun creates a new queued job with the selected preset. The new result will require human approval before it can be sent to the user.',
    });
    if (!confirmed) {
      return;
    }
    try {
      setBusyJobId(jobId);
      setRecoveryMessage(await rerunJob(jobId, setupId));
      router.refresh();
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleReapplyResult(jobId: string) {
    const confirmed = await confirm({
      title: 'Reapply try-on result',
      message:
        'Reapply repairs publication links from the completed result. It does not auto-approve pending results.',
    });
    if (!confirmed) {
      return;
    }
    try {
      setBusyJobId(jobId);
      setRecoveryMessage(await reapplyResult(jobId));
      router.refresh();
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleReplaceSource(jobId: string, setupId: string | undefined, file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setRecoveryMessage('That photo is larger than 10 MB - please pick a smaller file.');
      return;
    }
    const confirmed = await confirm({
      title: 'Replace photo & rerun',
      message:
        'Uploads the selected photo as the new source image and queues a new job with the selected preset. Use this when the original source image is no longer reachable at its host.',
    });
    if (!confirmed) return;
    try {
      setBusyJobId(jobId);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the selected file'));
        reader.readAsDataURL(file);
      });
      setRecoveryMessage(await rerunJob(jobId, setupId, dataUrl));
      router.refresh();
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : 'Failed to replace the source photo');
    } finally {
      setBusyJobId(null);
    }
  }

  async function handleRestoreOrphaned(jobId: string, submissionId: string) {
    const confirmed = await confirm({
      title: 'Restore prior result',
      message:
        'This rerun failed without producing a new result. Restoring brings its predecessor back to Vetting, pending review again.',
    });
    if (!confirmed) {
      return;
    }
    try {
      setBusyJobId(jobId);
      setRecoveryMessage(await restoreOrphanedResult(submissionId));
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
    <div style={{ display: 'grid', gap: '1rem' }}>
      {recoveryMessage ? (
        <p role="status" style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
          {recoveryMessage}
        </p>
      ) : null}
      <DataTable<QueueTableRow>
      data={displayRows as QueueTableRow[]}
      columns={[
        {
          key: 'job',
          label: 'Job',
          render: (row) => (
            <>
              <strong>{row.jobId}</strong>
              <p suppressHydrationWarning style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                Created {new Date(row.createdAt).toLocaleString()}
              </p>
              <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                Submission {row.source.submissionId}
              </p>
              {/* On phones only the first columns fit without horizontal
                  scrolling, so the source preview lives here rather than in
                  the (off-screen) Source column. */}
              <div style={{ marginTop: '0.5rem' }}>
                <SourceImagePreview row={row} />
              </div>
            </>
          ),
        },
        {
          key: 'status',
          label: 'Status',
          render: (row) => (
            <>
              <StatusBadge {...getStatusBadgeProps(toneForStatus(row.status), formatStatusLabel(row.status))} />
              <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: '0.5rem 0 0' }}>
                Stage: {formatStatusLabel(row.stage)}
              </p>
              {row.error?.message ? (
                <div style={{ display: 'grid', gap: 2, marginTop: '0.5rem' }}>
                  {row.error.code ? (
                    <strong style={{ fontSize: '0.75rem' }}>
                      {formatStatusLabel(row.error.code)}
                    </strong>
                  ) : null}
                  <span style={{ fontSize: '0.75rem' }}>
                    {row.error.message}
                  </span>
                </div>
              ) : null}
              <div style={{ display: 'grid', gap: '0.5rem', justifyItems: 'start', marginTop: '0.75rem' }}>
              {(row.status === 'failed' || row.status === 'retry_wait') ? (
                <SemanticButton
                  action="tryon:retry-job"
                  variant="secondary"
                  size="xs"
                  loading={busyJobId === row.jobId}
                  aria-label={`Retry try-on job ${row.jobId}`}
                  onClick={() => void handleRetry(row.jobId)}
                >
                  Retry job
                </SemanticButton>
              ) : null}
              {row.status === 'failed' && row.orphanedResultSubmissionId ? (
                <SemanticButton
                  action="tryon:restore-orphaned-result"
                  variant="secondary"
                  size="xs"
                  loading={busyJobId === row.jobId}
                  aria-label={`Restore the result this failed rerun was meant to replace`}
                  onClick={() => void handleRestoreOrphaned(row.jobId, row.orphanedResultSubmissionId as string)}
                >
                  Restore Prior Result
                </SemanticButton>
              ) : null}
              {(row.status === 'failed' || row.status === 'retry_wait' || row.status === 'done') ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {(() => {
                    // Default to a preset OTHER than the one this job already used --
                    // an operator rerunning a failed job is almost always here because
                    // that preset didn't work. Same fallback order as vetting's rerun
                    // picker: only repeat it (or fall to the catalog default) when
                    // there's no alternative to offer.
                    const usedSetupId = row.processing.resolvedSetup?.setupId ?? row.request.setupId ?? null;
                    const alternativeSetupId = setupOptions.find((setup) => setup.setupId !== usedSetupId)?.setupId;
                    const selectedSetupId =
                      selectedSetupByJob[row.jobId] ??
                      alternativeSetupId ??
                      (usedSetupId && setupOptions.some((setup) => setup.setupId === usedSetupId)
                        ? usedSetupId
                        : defaultSetupId);
                    return (
                      <>
                        {setupOptions.length > 0 ? (
                          <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700 }}>
                            Try-on preset
                            <select
                            value={selectedSetupId}
                            onChange={(event) => {
                              setSelectedSetupByJob((state) => ({ ...state, [row.jobId]: event.currentTarget.value }));
                            }}
                            disabled={busyJobId === row.jobId}
                            style={{ minHeight: 36, minWidth: 180 }}
                          >
                            {setupOptions.map((setup) => (
                              <option key={setup.setupId} value={setup.setupId}>
                                {setup.name}{setup.isDefault ? ' (default)' : ''}
                              </option>
                            ))}
                            </select>
                          </label>
                        ) : (
                          <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                            Preset list unavailable
                          </span>
                        )}
                        <SemanticButton
                          action="tryon:rerun-job"
                          variant="secondary"
                          size="xs"
                          loading={busyJobId === row.jobId}
                          aria-label={`Rerun try-on job ${row.jobId}`}
                          onClick={() => void handleRerun(row.jobId, selectedSetupId)}
                        >
                          Rerun
                        </SemanticButton>
                        {(row.status === 'failed' || row.status === 'retry_wait') ? (
                          <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700 }}>
                            Replace photo &amp; rerun
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={busyJobId === row.jobId}
                              aria-label={`Upload a replacement source photo for job ${row.jobId} and rerun`}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0] ?? null;
                                event.currentTarget.value = '';
                                if (file) void handleReplaceSource(row.jobId, selectedSetupId, file);
                              }}
                              style={{ fontSize: '0.75rem', maxWidth: 220 }}
                            />
                          </label>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              ) : null}
              {(row.status === 'done' && Boolean(row.result.publicResultUrl)) ? (
                <SemanticButton
                  action="tryon:resend-result"
                  variant="secondary"
                  size="xs"
                  loading={busyJobId === row.jobId}
                  aria-label={`Re-send try-on result ${row.jobId}`}
                  onClick={() => void handleReapplyResult(row.jobId)}
                >
                  Resend to user
                </SemanticButton>
              ) : null}
              </div>
            </>
          ),
        },
        {
          key: 'source',
          label: 'Source',
          render: (row) => (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <span style={{ display: '-webkit-box', fontSize: '0.875rem', overflow: 'hidden', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}>
                {row.source.imageUrl}
              </span>
              {row.source.eventName || row.source.eventMongoId ? (
                // --gds-color-muted (the previous token here) is not a variable GDS
                // defines; it resolved to nothing. Mantine's dimmed token is what the
                // rest of this admin uses for secondary text.
                <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem' }}>
                  Event {row.source.eventName ?? row.source.eventMongoId}
                </span>
              ) : null}
            </div>
          ),
        },
        {
          key: 'suit',
          label: 'Garment',
          render: (row) => <span style={{ fontSize: '0.875rem' }}>{row.request.leatherSuitId}</span>,
        },
        {
          key: 'preset',
          label: 'Preset',
          render: (row) => {
            const setupForDisplay = row.processing.resolvedSetup
              ? {
                  setupId: row.processing.resolvedSetup.setupId,
                  setupName: row.processing.resolvedSetup.setupName,
                }
              : typeof row.request.setupId === 'string'
                ? { setupId: row.request.setupId }
                : null;
            return <span style={{ fontSize: '0.875rem' }}>{getSetupLabel(setupsById, setupForDisplay)}</span>;
          },
        },
        {
          key: 'worker',
          label: 'Worker',
          render: (row) => (
            <>
              <span style={{ fontSize: '0.875rem' }}>{row.processing.workerId || 'Unclaimed'}</span>
              <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                Attempts {row.processing.attemptCount}
              </p>
              {row.processing.nextAttemptAt ? (
                <p suppressHydrationWarning style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                  Next {new Date(row.processing.nextAttemptAt).toLocaleString()}
                </p>
              ) : null}
            </>
          ),
        },
        {
          key: 'result',
          label: 'Result',
          render: (row) => (
            <div style={{ alignItems: 'flex-start', display: 'grid', gap: '0.5rem' }}>
              <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem' }}>
                {recoveryHint(row)}
              </span>
              {row.result.publicResultUrl ? (
                <a href={row.result.publicResultUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem' }}>
                  Open result
                </a>
              ) : (
                <span style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem' }}>
                  No result yet
                </span>
              )}
            </div>
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
        <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
          All {totalCount} matching jobs loaded.
        </p>
      )}
    </div>
  );
}
