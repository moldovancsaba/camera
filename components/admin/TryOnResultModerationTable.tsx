'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Button, Group, Paper, Select, Stack, Text, Textarea, UnstyledButton } from '@/components/gds/PublicPrimitives';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminModal, ResponsiveDataView } from '@sovereignsquad/gds-admin/client';
import { GdsMediaFrame, StateBlock, StatusBadge, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';
import { getStatusBadgeProps, type CameraStatusTone } from '@/lib/gds/presentation';
import type { TryOnSetup } from '@/lib/tryon/setup-resolution';
import type { TryOnSuitOption } from '@/lib/tryon/suits';

interface FrameOption {
  frameId: string;
  name: string;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function resolveDisplayName(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const isEventGuest = normalized.toLowerCase() === 'event guest';
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);

  if (normalized && !isEventGuest && !isEmail) {
    return normalized;
  }
  return 'Guest';
}

export interface ModerationRow {
  id: string;
  sourceJobId: string | null;
  imageUrl: string;
  previewImageUrl: string | null;
  originalImageUrl: string | null;
  userName: string;
  userEmail: string;
  eventName: string | null;
  partnerName: string | null;
  tryOnLeatherSuitId: string | null;
  tryOnLeatherSuitName: string | null;
  reviewStatus: 'pending_review' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt: string | null;
  isShareVisible: boolean;
  isSlideshowEligible: boolean;
  isGreat: boolean;
  archiveReason?: string | null;
  archiveSupersededByJobId?: string | null;
  archiveSupersededAt?: string | null;
  identityGapActionable?: boolean;
  recentAudit?: Array<{
    eventId: string;
    action: string;
    actorEmail: string;
    createdAt: string;
    reason?: string | null;
  }>;
  setup: {
    setupId: string;
    setupName?: string | null;
    setupProfile?: string | null;
    setupSource?: string | null;
  } | null;
}

type ModerationTableRow = ModerationRow & Record<string, unknown>;

interface ModerationListQuery {
  reviewStatus?: string;
  archive?: string;
  eventId?: string;
  search?: string;
}

async function postDecision(id: string, action: 'approve' | 'reject', notes?: string) {
  const response = await fetch(`/api/admin/tryon-results/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notes ? { notes } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Failed to ${action} try-on result`);
  }
}

async function postGreat(id: string, isGreat: boolean) {
  const response = await fetch(`/api/admin/tryon-results/${id}/${isGreat ? 'remove-great' : 'great'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isGreat ? {} : { great: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || (isGreat ? 'Failed to remove Greatest Hits flag' : 'Failed to mark result as Great'));
  }
}

async function postService(id: string) {
  const response = await fetch(`/api/admin/tryon-results/${id}/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to mark try-on result as Service');
  }
}

async function postRemove(id: string) {
  const response = await fetch(`/api/admin/tryon-results/${id}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to remove try-on result');
  }
}

async function postRerun(sourceJobId: string, setupId?: string, leatherSuitId?: string) {
  const response = await fetch(`/api/admin/tryon-jobs/${sourceJobId}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(setupId ? { setupId } : {}), ...(leatherSuitId ? { leatherSuitId } : {}) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to resubmit try-on job');
  }

  return {
    jobId: typeof payload.data?.jobId === 'string' ? payload.data.jobId : null,
    setupId: typeof payload.data?.setupId === 'string' ? payload.data.setupId : null,
  };
}

async function postReframe(submissionId: string, frameId: string) {
  const response = await fetch(`/api/admin/tryon-results/${submissionId}/reframe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frameId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to change frame');
  }
  return {
    imageUrl: typeof payload.data?.imageUrl === 'string' ? payload.data.imageUrl : null,
    frameName: typeof payload.data?.frameName === 'string' ? payload.data.frameName : frameId,
  };
}

function reviewTone(status: ModerationRow['reviewStatus']): CameraStatusTone {
  if (status === 'approved') return 'active' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'warning' as const;
}

function reviewLabel(row: ModerationRow) {
  if (row.archiveReason === 'quality_rerun_superseded') {
    return 'superseded by rerun';
  }
  return row.reviewStatus.replace(/_/g, ' ');
}

function isSupersededRow(row: ModerationRow): boolean {
  return row.archiveReason === 'quality_rerun_superseded';
}

function scopeLabel(row: ModerationRow) {
  return row.eventName || 'Unscoped event';
}

function visibilityLabel(row: ModerationRow) {
  return `Share: ${row.isShareVisible ? 'Visible' : 'Hidden'} · Slideshow: ${row.isSlideshowEligible ? 'Eligible' : 'Hidden'}`;
}

function shouldShowEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'anonymous@event' && normalized !== 'anonymous@event.com';
}

function garmentLabel(row: ModerationRow) {
  return row.tryOnLeatherSuitName || row.tryOnLeatherSuitId || 'Unknown garment';
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

function setupDetailLabel(row: ModerationRow) {
  const details = [
    row.setup?.setupProfile ? `Profile: ${row.setup.setupProfile}` : null,
    row.setup?.setupSource ? `Source: ${row.setup.setupSource.replace(/\./g, ' ')}` : null,
    row.sourceJobId ? `Job: ${row.sourceJobId}` : null,
  ].filter((value): value is string => Boolean(value));

  return details.join(' · ');
}

function preloadImage(src: string | null | undefined, cache: Set<string>) {
  if (!src || cache.has(src)) return;
  cache.add(src);
  const image = document.createElement('img');
  image.decoding = 'async';
  image.src = src;
}

function playDing() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;

  const audioContext = new AudioContextConstructor();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.08);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.3);
  window.setTimeout(() => void audioContext.close().catch(() => undefined), 500);
}

function toModerationRow(value: unknown): ModerationRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<ModerationRow>;
  if (typeof row.id !== 'string' || typeof row.imageUrl !== 'string') return null;

  return {
    id: row.id,
    sourceJobId: typeof row.sourceJobId === 'string' ? row.sourceJobId : null,
    imageUrl: row.imageUrl,
    previewImageUrl: typeof row.previewImageUrl === 'string' ? row.previewImageUrl : null,
    originalImageUrl: typeof row.originalImageUrl === 'string' ? row.originalImageUrl : null,
    userName: typeof row.userName === 'string' ? row.userName : 'Guest',
    userEmail: typeof row.userEmail === 'string' ? row.userEmail : '',
    eventName: typeof row.eventName === 'string' ? row.eventName : null,
    partnerName: typeof row.partnerName === 'string' ? row.partnerName : null,
    tryOnLeatherSuitId: typeof row.tryOnLeatherSuitId === 'string' ? row.tryOnLeatherSuitId : null,
    tryOnLeatherSuitName: typeof row.tryOnLeatherSuitName === 'string' ? row.tryOnLeatherSuitName : null,
    reviewStatus:
      row.reviewStatus === 'approved' || row.reviewStatus === 'rejected'
        ? row.reviewStatus
        : 'pending_review',
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
    approvedAt: typeof row.approvedAt === 'string' ? row.approvedAt : null,
    isShareVisible: Boolean(row.isShareVisible),
    isSlideshowEligible: Boolean(row.isSlideshowEligible),
    isGreat: Boolean(row.isGreat),
    archiveReason: typeof row.archiveReason === 'string' ? row.archiveReason : null,
    archiveSupersededByJobId: typeof row.archiveSupersededByJobId === 'string' ? row.archiveSupersededByJobId : null,
    archiveSupersededAt: typeof row.archiveSupersededAt === 'string' ? row.archiveSupersededAt : null,
    identityGapActionable: Boolean(row.identityGapActionable),
    setup: row.setup && typeof row.setup === 'object' && typeof row.setup.setupId === 'string' ? row.setup : null,
  };
}

function PreviewImage({
  src,
  alt,
  width,
  height,
  onFailure,
  objectFit = 'cover',
}: {
  src: string | null | undefined;
  alt: string;
  width: number;
  height: number;
  onFailure?: () => void;
  objectFit?: 'contain' | 'cover';
}) {
  const [failed, setFailed] = useState(false);

  const markFailed = () => {
    setFailed(true);
    onFailure?.();
  };

  if (!src || failed) {
    return (
      <Paper
        withBorder
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          textAlign: 'center',
        }}
      >
        <Stack gap={2} align="center">
          <Text fw={700} size="xs" c="dimmed">
            Preview unavailable
          </Text>
          <Text size="10px" c="dimmed">
            External image missing
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      style={{ objectFit }}
      onError={markFailed}
    />
  );
}

function PreviewStrip({
  row,
  clickable,
  onOpen,
  onResultMissing,
  onOriginalMissing,
}: {
  row: ModerationRow;
  clickable?: boolean;
  onOpen?: () => void;
  onResultMissing?: () => void;
  onOriginalMissing?: () => void;
}) {
  const renderImage = (src: string | null, alt: string, onFailure?: () => void) => (
    <GdsMediaFrame
      fit="contain"
      style={{
        position: 'relative',
        width: 'min(100%, 400px)',
        aspectRatio: '4 / 5',
        maxHeight: 320,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--gds-color-surface-muted)',
      }}
    >
      <PreviewImage
        src={src}
        alt={alt}
        width={400}
        height={500}
        objectFit="contain"
        onFailure={onFailure}
      />
    </GdsMediaFrame>
  );

  const content = (
    <Stack gap="xs">
      {renderImage(row.previewImageUrl ?? row.imageUrl, 'Final try-on result', onResultMissing)}
      {row.originalImageUrl ? (
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            Original image
          </Text>
          {renderImage(row.originalImageUrl, 'Original image', onOriginalMissing)}
        </Stack>
      ) : null}
    </Stack>
  );

  if (!clickable) return content;

  return (
    <UnstyledButton
      type="button"
      onClick={onOpen}
      style={{
        display: 'block',
        padding: 0,
        textAlign: 'left',
        width: '100%',
      }}
      aria-label={`Open review modal for ${resolveDisplayName(row.userName)}`}
    >
      {content}
    </UnstyledButton>
  );
}

function ReviewImagePanel({
  src,
  secondarySrc,
  alt,
  label,
  onFailure,
  onSecondaryFailure,
  showSecondary,
}: {
  src: string | null | undefined;
  secondarySrc?: string | null | undefined;
  alt: string;
  label: string;
  onFailure?: () => void;
  onSecondaryFailure?: () => void;
  showSecondary?: boolean;
}) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <GdsMediaFrame
        fit="contain"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          minHeight: 320,
          maxHeight: '70vh',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'var(--gds-color-surface-muted)',
        }}
      >
        <PreviewImage
          src={src}
          alt={alt}
          width={768}
          height={1024}
          objectFit="contain"
          onFailure={onFailure}
        />
      </GdsMediaFrame>
      {showSecondary && secondarySrc ? (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Original image
          </Text>
          <GdsMediaFrame
            fit="contain"
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '4 / 5',
              maxHeight: 360,
              borderRadius: 16,
              overflow: 'hidden',
              background: 'var(--gds-color-surface-muted)',
            }}
          >
            <PreviewImage
              src={secondarySrc}
              alt="Original source image"
              width={768}
              height={960}
              objectFit="contain"
              onFailure={onSecondaryFailure}
            />
          </GdsMediaFrame>
        </Stack>
      ) : null}
    </Stack>
  );
}

function ModerationActions({
  row,
  busyId,
  onRequestDecision,
  onGreat,
  onService,
  onRemove,
}: {
  row: ModerationRow;
  busyId: string | null;
  onRequestDecision: (row: ModerationRow, action: 'approve' | 'reject') => void;
  onGreat: (row: ModerationRow) => Promise<void>;
  onService: (row: ModerationRow) => Promise<void>;
  onRemove: (row: ModerationRow) => Promise<void>;
}) {
  const isApproved = row.reviewStatus === 'approved';
  const isRejected = row.reviewStatus === 'rejected';
  const archivedReadOnly = isSupersededRow(row);

  return (
    <Stack gap="xs" style={{ width: '100%' }}>
      {archivedReadOnly ? (
        <Text size="xs" c="dimmed">
          Superseded by rerun job{' '}
          {row.archiveSupersededByJobId ? (
            <Link href={`/admin/tryon/queue?search=${encodeURIComponent(row.archiveSupersededByJobId)}`}>
              {row.archiveSupersededByJobId}
            </Link>
          ) : (
            'unknown'
          )}
          .
        </Text>
      ) : null}
      <Group justify="stretch" gap="xs" grow wrap="nowrap">
        <SemanticButton
          action="tryon:approve"
          loading={busyId === `${row.id}:approve`}
          disabled={isApproved || archivedReadOnly}
          aria-label={isApproved ? 'Try-on result approved' : 'Approve try-on result'}
          onClick={() => onRequestDecision(row, 'approve')}
        >
          {isApproved ? 'Approved' : 'Approve'}
        </SemanticButton>
        <SemanticButton
          action="tryon:reject"
          loading={busyId === `${row.id}:reject`}
          disabled={isRejected || archivedReadOnly}
          aria-label={isRejected ? 'Try-on result rejected' : 'Reject try-on result'}
          onClick={() => onRequestDecision(row, 'reject')}
        >
          {isRejected ? 'Rejected' : 'Reject'}
        </SemanticButton>
      </Group>
      <Group justify="stretch" gap="xs" grow wrap="nowrap">
        <SemanticButton
          action="tryon:great"
          loading={busyId === `${row.id}:great`}
          disabled={row.isGreat || archivedReadOnly}
          aria-label={row.isGreat ? 'Try-on result marked Great' : 'Mark try-on result as Great'}
          onClick={() => void onGreat(row)}
        >
          {row.isGreat ? 'Marked Great' : 'Great'}
        </SemanticButton>
        <SemanticButton
          action="tryon:remove-great"
          loading={busyId === `${row.id}:great`}
          disabled={!row.isGreat || archivedReadOnly}
          aria-label="Remove from Greatest Hits"
          onClick={() => void onGreat(row)}
        >
          Remove Great
        </SemanticButton>
        <SemanticButton
          action="tryon:service"
          loading={busyId === `${row.id}:service`}
          disabled={archivedReadOnly}
          aria-label="Mark try-on result as Service"
          onClick={() => void onService(row)}
        >
          Service
        </SemanticButton>
      </Group>
      <Group justify="stretch" gap="xs" grow wrap="nowrap">
        <Button
          component="a"
          href={row.imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="light"
          disabled={!row.imageUrl}
        >
          View
        </Button>
        <Button
          component="a"
          href={row.imageUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          variant="light"
          disabled={!row.imageUrl}
        >
          Download
        </Button>
      </Group>
      {row.sourceJobId ? (
        <Button
          component="a"
          href={`/admin/tryon/queue?search=${encodeURIComponent(row.sourceJobId)}`}
          variant="light"
          fullWidth
        >
          Fix (open in Queue)
        </Button>
      ) : null}
      <SemanticButton
        action="tryon:remove"
        loading={busyId === `${row.id}:remove`}
        variant="light"
        color="red"
        fullWidth
        aria-label="Permanently remove this try-on result"
        onClick={() => void onRemove(row)}
      >
        Remove
      </SemanticButton>
    </Stack>
  );
}

export default function TryOnResultModerationTable({
  rows,
  setupOptions = [],
  suitOptions = [],
  frameOptions = [],
  totalCount = rows.length,
  listQuery = {},
  autoRefresh = false,
  emptyTitle = 'No try-on results need review',
  emptyDescription = 'Generated try-on results will appear here after the local worker uploads them back to Camera.',
}: {
  rows: ModerationRow[];
  setupOptions?: TryOnSetup[];
  suitOptions?: TryOnSuitOption[];
  frameOptions?: FrameOption[];
  totalCount?: number;
  listQuery?: ModerationListQuery;
  autoRefresh?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const { notifySuccess, notifyError } = useGdsToasts();
  const { confirm } = useGdsConfirm();
  const [displayRows, setDisplayRows] = useState(rows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastRefreshLabel, setLastRefreshLabel] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedSetupByRow, setSelectedSetupByRow] = useState<Record<string, string>>({});
  const [selectedSuitByRow, setSelectedSuitByRow] = useState<Record<string, string>>({});
  const [rerunFeedbackByRow, setRerunFeedbackByRow] = useState<Record<string, string>>({});
  const [pendingDecision, setPendingDecision] = useState<{ row: ModerationRow; action: 'approve' | 'reject' } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedFrameId, setSelectedFrameId] = useState('');
  const [isReframing, setIsReframing] = useState(false);
  const [reframeFeedback, setReframeFeedback] = useState<string | null>(null);
  const [assetHealth, setAssetHealth] = useState<
    Record<string, { resultMissing?: boolean; originalMissing?: boolean }>
  >({});
  const knownRowIdsRef = useRef(new Set(rows.map((row) => row.id)));
  const isPollingRef = useRef(false);
  const preloadedImageUrlsRef = useRef(new Set<string>());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const LIST_LIMIT = 24;

  useEffect(() => {
    setSelectedFrameId('');
    setReframeFeedback(null);
  }, [activeRowId]);

  const activeRow = displayRows.find((row) => row.id === activeRowId) ?? null;
  const setupsById = useMemo(() => makeSetupDisplayMap(setupOptions), [setupOptions]);
  const defaultSetupId = setupOptions[0]?.setupId ?? '';
  const hasMore = displayRows.length < totalCount;
  const queryReviewStatus = listQuery.reviewStatus?.trim() || '';
  const queryArchive = listQuery.archive?.trim() || '';
  const queryEventId = listQuery.eventId?.trim() || '';
  const querySearch = listQuery.search?.trim() || '';

  useEffect(() => {
    setDisplayRows(rows);
    knownRowIdsRef.current = new Set(rows.map((row) => row.id));
  }, [rows]);

  useEffect(() => {
    const cache = preloadedImageUrlsRef.current;
    for (const row of displayRows) {
      preloadImage(row.imageUrl, cache);
      preloadImage(row.originalImageUrl, cache);
    }
  }, [displayRows]);

  const buildResultListParams = useCallback(
    (offsetValue: number) => {
      const params = new URLSearchParams();
      if (queryReviewStatus) params.set('reviewStatus', queryReviewStatus);
      if (queryArchive) params.set('archive', queryArchive);
      if (queryEventId) params.set('eventId', queryEventId);
      if (querySearch) params.set('search', querySearch);
      params.set('offset', String(offsetValue));
      params.set('limit', String(LIST_LIMIT));
      return params;
    },
    [queryArchive, queryEventId, queryReviewStatus, querySearch]
  );

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const params = buildResultListParams(displayRows.length);
      const response = await fetch(`/api/admin/tryon-results?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.data?.results)) return;

      const nextRows = payload.data.results
        .map((value: unknown) => toModerationRow(value))
        .filter((value: ModerationRow | null): value is ModerationRow => Boolean(value));

      setDisplayRows((current) => {
        const knownIds = new Set(current.map((row) => row.id));
        return [...current, ...nextRows.filter((row: ModerationRow) => !knownIds.has(row.id))];
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [buildResultListParams, displayRows.length, hasMore, isLoadingMore]);

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

  const refreshRows = useCallback(async () => {
    if (!autoRefresh || isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const params = buildResultListParams(0);
      params.set('reviewStatus', 'pending_review');

      const response = await fetch(`/api/admin/tryon-results?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(payload.data?.results)) return;

      const nextRows: ModerationRow[] = payload.data.results
        .map((value: unknown) => toModerationRow(value))
        .filter((value: ModerationRow | null): value is ModerationRow => Boolean(value));
      const previousIds = knownRowIdsRef.current;
      const hasNewRows = nextRows.some((row: ModerationRow) => !previousIds.has(row.id));

      knownRowIdsRef.current = new Set(nextRows.map((row: ModerationRow) => row.id));
      setDisplayRows(nextRows);
      setLastRefreshLabel(new Date().toLocaleTimeString());

      if (hasNewRows) {
        if (soundEnabled) {
          playDing();
        }
        router.refresh();
      }
    } finally {
      isPollingRef.current = false;
    }
  }, [autoRefresh, buildResultListParams, router, soundEnabled]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshRows();
      }
    }, 15000);
    void refreshRows();
    return () => window.clearInterval(interval);
  }, [autoRefresh, refreshRows]);

  function markAssetMissing(rowId: string, kind: 'resultMissing' | 'originalMissing') {
    setAssetHealth((current) => {
      const existing = current[rowId] ?? {};
      if (existing[kind]) return current;
      return {
        ...current,
        [rowId]: {
          ...existing,
          [kind]: true,
        },
      };
    });
  }

  function assetHealthLabel(rowId: string) {
    const state = assetHealth[rowId];
    if (!state) return null;
    if (state.resultMissing && state.originalMissing) return 'Generated and source assets missing';
    if (state.resultMissing) return 'Generated asset missing';
    if (state.originalMissing) return 'Source asset missing';
    return null;
  }

  async function handleDecision(rowId: string, action: 'approve' | 'reject', notes?: string) {
    try {
      setBusyId(`${rowId}:${action}`);
      await postDecision(rowId, action, notes);
      notifySuccess({
        title: action === 'approve' ? 'Approved' : 'Rejected',
        message: action === 'approve' ? 'Try-on result approved.' : 'Try-on result rejected.',
      });
      if (activeRowId === rowId) {
        setActiveRowId(null);
      }
      setPendingDecision(null);
      router.refresh();
    } catch (error) {
      notifyError({
        title: 'Moderation failed',
        message: error instanceof Error ? error.message : 'Moderation action failed.',
      });
    } finally {
      setBusyId(null);
    }
  }

  // WHAT: Approve/Reject now go through a confirm step instead of firing on
  // click. WHY: Approve emails the guest immediately with no undo, but
  // previously had no more friction than Great/Service; Reject archives the
  // result out of the active queue. The dialog stays open with the entered
  // reason intact if the request fails, so the operator can retry.
  function requestDecision(row: ModerationRow, action: 'approve' | 'reject') {
    setRejectReason('');
    setPendingDecision({ row, action });
  }

  function confirmPendingDecision() {
    if (!pendingDecision) return;
    const { row, action } = pendingDecision;
    void handleDecision(row.id, action, action === 'reject' ? rejectReason.trim() || undefined : undefined);
  }

  async function handleRemove(row: ModerationRow) {
    const confirmed = await confirm({
      title: 'Remove try-on result',
      message: 'This permanently deletes this result. It will not appear in any bucket again. This cannot be undone.',
    });
    if (!confirmed) return;
    try {
      setBusyId(`${row.id}:remove`);
      await postRemove(row.id);
      notifySuccess({ title: 'Removed', message: 'Try-on result permanently removed.' });
      setDisplayRows((current) => {
        const next = current.filter((item) => item.id !== row.id);
        knownRowIdsRef.current = new Set(next.map((item) => item.id));
        return next;
      });
      if (activeRowId === row.id) {
        setActiveRowId(null);
      }
      router.refresh();
    } catch (error) {
      notifyError({
        title: 'Remove failed',
        message: error instanceof Error ? error.message : 'Failed to remove try-on result.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleGreat(row: ModerationRow) {
    try {
      setBusyId(`${row.id}:great`);
      await postGreat(row.id, row.isGreat);
      notifySuccess({
        title: row.isGreat ? 'Great removed' : 'Marked Great',
        message: row.isGreat ? 'Removed from Greatest Hits.' : 'Marked as Great.',
      });
      if (activeRowId === row.id && !row.isGreat) {
        setActiveRowId(null);
      }
      router.refresh();
    } catch (error) {
      notifyError({
        title: 'Great action failed',
        message: error instanceof Error ? error.message : 'Great action failed.',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleService(row: ModerationRow) {
    try {
      setBusyId(`${row.id}:service`);
      await postService(row.id);
      notifySuccess({ title: 'Service', message: 'Marked as Service.' });
      if (activeRowId === row.id) {
        setActiveRowId(null);
      }
      router.refresh();
    } catch (error) {
      notifyError({
        title: 'Service action failed',
        message: error instanceof Error ? error.message : 'Service action failed.',
      });
    } finally {
      setBusyId(null);
    }
  }

  function selectedSetupIdForRow(row: ModerationRow) {
    if (selectedSetupByRow[row.id]) {
      return selectedSetupByRow[row.id];
    }
    // Default to a preset OTHER than the one that produced this result -- an
    // operator opening the rerun picker is almost always here because the
    // original preset's output wasn't good enough. Only fall back to the same
    // one (or the catalog default) when there is no alternative to offer.
    const alternative = setupOptions.find((setup) => setup.setupId !== row.setup?.setupId);
    return alternative?.setupId ?? row.setup?.setupId ?? defaultSetupId;
  }

  // Garment defaults to the SAME one the result already used -- unlike the
  // preset, a bad result is much more often a preset problem than a garment
  // problem, so this is an explicit override, not a nudge toward changing it.
  function selectedSuitIdForRow(row: ModerationRow) {
    return selectedSuitByRow[row.id] ?? row.tryOnLeatherSuitId ?? '';
  }

  async function handleRerun(row: ModerationRow) {
    if (!row.sourceJobId) return;

    const selectedSetupId = selectedSetupIdForRow(row);
    const selectedSuitId = selectedSuitIdForRow(row);
    try {
      setBusyId(`${row.id}:rerun`);
      const result = await postRerun(row.sourceJobId, selectedSetupId || undefined, selectedSuitId || undefined);
      const setupLabel = getSetupLabel(
        setupsById,
        selectedSetupId ? { setupId: selectedSetupId } : row.setup
      );
      setRerunFeedbackByRow((current) => ({
        ...current,
        [row.id]: result.jobId
          ? `Job resubmitted as ${result.jobId} with ${setupLabel}. The new result will return to pending review before publication.`
          : `Job resubmitted with ${setupLabel}. The new result will return to pending review before publication.`,
      }));
      setDisplayRows((current) => {
        const next = current.filter((item) => item.id !== row.id);
        knownRowIdsRef.current = new Set(next.map((item) => item.id));
        return next;
      });
      if (activeRowId === row.id) {
        setActiveRowId(null);
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  // WHAT: Recomposites an existing result with a different frame -- no AI
  // rerun, just the same fast compositing step the local worker already
  // does once. WHY: the audit found no way to change a finished result's
  // frame at all; the only precedent (scripts/reframe-tryon-results.ts) is
  // a bulk backfill CLI that always re-applies the SAME frame, not a
  // different one an operator picks.
  async function handleReframe(row: ModerationRow) {
    if (!selectedFrameId) return;
    setIsReframing(true);
    setReframeFeedback(null);
    try {
      const result = await postReframe(row.id, selectedFrameId);
      setReframeFeedback(`Frame changed to ${result.frameName}.`);
      notifySuccess({ title: 'Frame changed', message: `Frame changed to ${result.frameName}.` });
      router.refresh();
    } catch (error) {
      notifyError({ title: 'Reframe failed', message: error instanceof Error ? error.message : 'Failed to change frame.' });
    } finally {
      setIsReframing(false);
    }
  }

  function toggleSound() {
    setSoundEnabled((enabled) => {
      if (!enabled) {
        playDing();
      }
      return !enabled;
    });
  }

  function renderPresetControls(row: ModerationRow) {
    const selectedSetupId = selectedSetupIdForRow(row);
    const selectedSuitId = selectedSuitIdForRow(row);
    const presetLabel = getSetupLabel(setupsById, row.setup);
    const detailLabel = setupDetailLabel(row);
    const feedback = rerunFeedbackByRow[row.id];

    return (
      <Stack gap="xs" align="stretch">
        <Stack gap={2}>
          <Text fw={700} size="sm">
            {presetLabel}
          </Text>
          {row.setup?.setupId ? (
            <Text size="xs" c="dimmed">
              {row.setup.setupId}
            </Text>
          ) : null}
          {detailLabel ? (
            <Text size="xs" c="dimmed">
              {detailLabel}
            </Text>
          ) : null}
        </Stack>
        {setupOptions.length > 0 ? (
          <Select
            label="Rerun preset"
            data={setupOptions.map((setup) => ({
              value: setup.setupId,
              label: `${setup.name}${setup.isDefault ? ' (default)' : ''}`,
            }))}
            value={selectedSetupId}
            onChange={(nextSetupId) => {
              if (typeof nextSetupId === 'string') {
                setSelectedSetupByRow((state) => ({ ...state, [row.id]: nextSetupId }));
              }
            }}
            size="xs"
            checkIconPosition="left"
            disabled={busyId === `${row.id}:rerun`}
          />
        ) : (
          <Text size="xs" c="dimmed">
            Preset list unavailable
          </Text>
        )}
        {suitOptions.length > 0 ? (
          <Select
            label="Rerun garment"
            data={suitOptions.map((suit) => ({ value: suit.id, label: suit.name }))}
            value={selectedSuitId || null}
            onChange={(nextSuitId) => {
              if (typeof nextSuitId === 'string') {
                setSelectedSuitByRow((state) => ({ ...state, [row.id]: nextSuitId }));
              }
            }}
            size="xs"
            checkIconPosition="left"
            disabled={busyId === `${row.id}:rerun`}
          />
        ) : null}
        <Button
          variant="outline"
          size="xs"
          loading={busyId === `${row.id}:rerun`}
          disabled={!row.sourceJobId || setupOptions.length === 0}
          aria-label={`Rerun try-on job for ${resolveDisplayName(row.userName)}`}
          onClick={() => void handleRerun(row)}
        >
          Rerun
        </Button>
        {feedback ? (
          <Text size="xs" c="teal">
            {feedback}
          </Text>
        ) : null}
      </Stack>
    );
  }

  if (displayRows.length === 0) {
    return (
      <Stack gap="md">
        {autoRefresh ? (
          <Group justify="space-between" gap="sm">
            <Text size="sm" c="dimmed">
              Auto-refresh checks for new vetting results every 15 seconds.
              {lastRefreshLabel ? ` Last checked ${lastRefreshLabel}.` : ''}
            </Text>
            <Button
              size="xs"
              variant={soundEnabled ? 'light' : 'outline'}
              onClick={toggleSound}
            >
              {soundEnabled ? 'Disable sound' : 'Enable sound'}
            </Button>
          </Group>
        ) : null}
        <StateBlock
          variant="empty"
          title={emptyTitle}
          description={emptyDescription}
        />
      </Stack>
    );
  }

  return (
    <>
      {autoRefresh ? (
        <Group justify="space-between" gap="sm" mb="md">
          <Text size="sm" c="dimmed">
            Auto-refresh checks for new vetting results every 15 seconds.
            {lastRefreshLabel ? ` Last checked ${lastRefreshLabel}.` : ''}
          </Text>
          <Button
            size="xs"
            variant={soundEnabled ? 'light' : 'outline'}
            onClick={toggleSound}
          >
            {soundEnabled ? 'Disable sound' : 'Enable sound'}
          </Button>
        </Group>
      ) : null}
      <ResponsiveDataView<ModerationTableRow>
        data={displayRows as ModerationTableRow[]}
        columns={[
          {
            key: 'preview',
            label: 'Preview',
            render: (row) => (
              <PreviewStrip
                row={row}
                clickable
                onOpen={() => setActiveRowId(row.id)}
                onResultMissing={() => markAssetMissing(row.id, 'resultMissing')}
                onOriginalMissing={() => markAssetMissing(row.id, 'originalMissing')}
              />
            ),
          },
          {
            // WHAT: Approve/Reject/Great/Service and the rerun preset picker
            // in one column. WHY: they used to be two columns apart with
            // User/Event/Garment between them -- the audit's "model swap is
            // hidden" complaint was literally true for this table layout.
            key: 'quickActions',
            label: 'Actions',
            render: (row) => (
              <Stack gap="xs">
                <ModerationActions row={row} busyId={busyId} onRequestDecision={requestDecision} onGreat={handleGreat} onService={handleService} onRemove={handleRemove} />
                {renderPresetControls(row)}
              </Stack>
            ),
          },
          {
            key: 'user',
            label: 'User',
            render: (row) => (
              <Stack gap={2}>
                <Text fw={700}>{resolveDisplayName(row.userName)}</Text>
                {shouldShowEmail(row.userEmail) ? (
                  <Text size="sm" c="dimmed">
                    {row.userEmail}
                  </Text>
                ) : null}
                <Text size="xs" c="dimmed" suppressHydrationWarning>
                  {new Date(row.createdAt).toLocaleString()}
                </Text>
              </Stack>
            ),
          },
          {
            key: 'scope',
            label: 'Event / Partner',
            render: (row) => (
              <Stack gap={2}>
                <Text>{scopeLabel(row)}</Text>
                <Text size="sm" c="dimmed">
                  {row.partnerName || 'No partner'}
                </Text>
              </Stack>
            ),
          },
          {
            key: 'suit',
            label: 'Garment',
            render: (row) => <Text size="sm">{garmentLabel(row)}</Text>,
          },
          {
            key: 'status',
            label: 'Review Status',
            render: (row) => (
              <Stack gap="xs" align="flex-start">
                <StatusBadge {...getStatusBadgeProps(reviewTone(row.reviewStatus), reviewLabel(row))} />
                {isSupersededRow(row) && row.archiveSupersededByJobId ? (
                  <Text size="xs">
                    <Link href={`/admin/tryon/queue?search=${encodeURIComponent(row.archiveSupersededByJobId)}`}>
                      View superseding job
                    </Link>
                  </Text>
                ) : null}
                {row.identityGapActionable ? (
                  <StatusBadge {...getStatusBadgeProps('warning', 'Identity gap')} />
                ) : null}
                {row.isGreat ? (
                  <StatusBadge {...getStatusBadgeProps('active', 'Great')} />
                ) : null}
                <Text size="xs" c="dimmed">
                  {visibilityLabel(row)}
                </Text>
                {row.approvedAt ? (
                  <Text size="xs" c="dimmed" suppressHydrationWarning>
                    Approved {new Date(row.approvedAt).toLocaleString()}
                  </Text>
                ) : null}
                {assetHealthLabel(row.id) ? (
                  <Text size="xs" c="dimmed">
                    {assetHealthLabel(row.id)}
                  </Text>
                ) : null}
              </Stack>
            ),
          },
        ]}
        renderCard={(row) => (
          // WHAT: Actions live directly beside the image, not stacked below
          // metadata and status like AdminReviewLayout's fixed vertical order
          // put them. WHY: on a phone-width card, "below everything" meant
          // scrolling past name/event/garment/badges before Approve/Great/
          // Remove ever appeared -- reported live as unusable mid-event.
          <Paper p="md" radius="md" withBorder>
            <Group align="flex-start" wrap="nowrap" gap="md">
              <div style={{ width: 150, flexShrink: 0 }}>
                <PreviewStrip
                  row={row}
                  clickable
                  onOpen={() => setActiveRowId(row.id)}
                  onResultMissing={() => markAssetMissing(row.id, 'resultMissing')}
                  onOriginalMissing={() => markAssetMissing(row.id, 'originalMissing')}
                />
              </div>
              <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                <ModerationActions row={row} busyId={busyId} onRequestDecision={requestDecision} onGreat={handleGreat} onService={handleService} onRemove={handleRemove} />
              </Stack>
            </Group>
            <Stack gap="xs" mt="sm">
              <Text fw={700}>{resolveDisplayName(row.userName)}</Text>
              {shouldShowEmail(row.userEmail) ? (
                <Text size="sm" c="dimmed">
                  {row.userEmail}
                </Text>
              ) : null}
              <Text size="xs" c="dimmed">
                {scopeLabel(row)} · {row.partnerName || 'No partner'}
              </Text>
              <Text size="xs" c="dimmed">
                {garmentLabel(row)}
              </Text>
              <Group gap="xs">
                <StatusBadge {...getStatusBadgeProps(reviewTone(row.reviewStatus), reviewLabel(row))} />
                {row.isGreat ? (
                  <StatusBadge {...getStatusBadgeProps('active', 'Great')} />
                ) : null}
              </Group>
              <Text size="xs" c="dimmed">
                {visibilityLabel(row)}
              </Text>
              {assetHealthLabel(row.id) ? (
                <Text size="xs" c="dimmed">
                  {assetHealthLabel(row.id)}
                </Text>
              ) : null}
              {renderPresetControls(row)}
            </Stack>
          </Paper>
        )}
        getRowKey={(row) => row.id}
      />

      {hasMore ? (
        <div ref={sentinelRef}>
          <StateBlock
            variant="loading"
            title={isLoadingMore ? 'Loading more results...' : 'Scroll to load more results'}
            description={`${displayRows.length} of ${totalCount} matching results loaded.`}
          />
        </div>
      ) : null}
      {hasMore ? null : (
        <Text size="sm" c="dimmed" ta="center">
          All {totalCount} matching results loaded.
        </Text>
      )}

      <AdminModal
        opened={Boolean(activeRow)}
        onClose={() => setActiveRowId(null)}
        title={activeRow ? `Review result for ${resolveDisplayName(activeRow.userName)}` : 'Review result'}
        size="90rem"
      >
        {activeRow ? (
          <Stack gap="lg">
            <ReviewImagePanel
              src={activeRow.imageUrl}
              alt="Final try-on result"
              label="Final result"
              onFailure={() => markAssetMissing(activeRow.id, 'resultMissing')}
              secondarySrc={activeRow.originalImageUrl}
              onSecondaryFailure={() => markAssetMissing(activeRow.id, 'originalMissing')}
              showSecondary
            />
            <Stack gap={4}>
              <Text fw={700}>{resolveDisplayName(activeRow.userName)}</Text>
              {shouldShowEmail(activeRow.userEmail) ? (
                <Text size="sm" c="dimmed">
                  {activeRow.userEmail}
                </Text>
              ) : null}
              <Text size="sm">
                {scopeLabel(activeRow)} · {activeRow.partnerName || 'No partner'}
              </Text>
              <Text size="sm" c="dimmed">
                {garmentLabel(activeRow)}
              </Text>
            </Stack>
            {renderPresetControls(activeRow)}
            {frameOptions.length > 0 ? (
              <Stack gap="xs" align="stretch">
                <Text fw={700} size="sm">
                  Change frame
                </Text>
                <Text size="xs" c="dimmed">
                  Recomposites this result with a different frame -- no AI rerun, just the same
                  compositing step the worker already runs once.
                </Text>
                <Select
                  label="Frame"
                  data={frameOptions.map((frame) => ({ value: frame.frameId, label: frame.name }))}
                  value={selectedFrameId || null}
                  onChange={(value) => setSelectedFrameId(value ?? '')}
                  size="xs"
                  checkIconPosition="left"
                  disabled={isReframing}
                />
                <Button
                  variant="outline"
                  size="xs"
                  loading={isReframing}
                  disabled={!selectedFrameId}
                  onClick={() => void handleReframe(activeRow)}
                >
                  Apply Frame
                </Button>
                {reframeFeedback ? (
                  <Text size="xs" c="teal">
                    {reframeFeedback}
                  </Text>
                ) : null}
              </Stack>
            ) : null}
            <ModerationActions row={activeRow} busyId={busyId} onRequestDecision={requestDecision} onGreat={handleGreat} onService={handleService} onRemove={handleRemove} />
            <Stack gap="xs" align="flex-start">
              <StatusBadge {...getStatusBadgeProps(reviewTone(activeRow.reviewStatus), reviewLabel(activeRow))} />
              {activeRow.isGreat ? (
                <StatusBadge {...getStatusBadgeProps('active', 'Great')} />
              ) : null}
              <Text size="sm" c="dimmed">
                {visibilityLabel(activeRow)}
              </Text>
              {assetHealthLabel(activeRow.id) ? (
                <Text size="sm" c="dimmed">
                  {assetHealthLabel(activeRow.id)}
                </Text>
              ) : null}
            </Stack>
            <Stack gap="xs">
              <Text fw={700}>Audit history</Text>
              {activeRow.recentAudit && activeRow.recentAudit.length > 0 ? (
                activeRow.recentAudit.map((event) => (
                  <Paper key={event.eventId} p="sm" withBorder>
                    <Text size="sm" fw={700}>
                      {event.action.replace(/_/g, ' ')}
                    </Text>
                    <Text size="xs" c="dimmed" suppressHydrationWarning>
                      {event.actorEmail} · {new Date(event.createdAt).toLocaleString()}
                    </Text>
                    {event.reason ? (
                      <Text size="xs" c="dimmed">
                        {event.reason}
                      </Text>
                    ) : null}
                  </Paper>
                ))
              ) : (
                <Text size="sm" c="dimmed">
                  No audit events recorded for this result yet.
                </Text>
              )}
            </Stack>
          </Stack>
        ) : null}
      </AdminModal>

      <AdminModal
        opened={Boolean(pendingDecision)}
        onClose={() => setPendingDecision(null)}
        title={pendingDecision?.action === 'reject' ? 'Reject try-on result' : 'Approve try-on result'}
        size="md"
      >
        {pendingDecision ? (
          <Stack gap="md">
            <Text size="sm">
              {pendingDecision.action === 'approve'
                ? `This publishes the result to ${resolveDisplayName(pendingDecision.row.userName)} immediately -- there is no undo.`
                : `This rejects the result for ${resolveDisplayName(pendingDecision.row.userName)} and archives it out of the active queue.`}
            </Text>
            {pendingDecision.action === 'reject' ? (
              <Textarea
                label="Reason (optional)"
                placeholder="Why is this being rejected? Visible in the result's audit history."
                value={rejectReason}
                onChange={(event) => setRejectReason(event.currentTarget.value)}
                minRows={2}
                autosize
              />
            ) : null}
            <Group justify="flex-end" gap="xs">
              <Button variant="subtle" onClick={() => setPendingDecision(null)}>
                Cancel
              </Button>
              <SemanticButton
                action={pendingDecision.action === 'approve' ? 'tryon:approve' : 'tryon:reject'}
                loading={busyId === `${pendingDecision.row.id}:${pendingDecision.action}`}
                onClick={() => confirmPendingDecision()}
              >
                {pendingDecision.action === 'approve' ? 'Approve' : 'Reject'}
              </SemanticButton>
            </Group>
          </Stack>
        ) : null}
      </AdminModal>
    </>
  );
}
