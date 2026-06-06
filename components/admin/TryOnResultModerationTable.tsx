'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';
import { StateBlock, StatusBadge } from '@doneisbetter/gds-core/client';
import { Box, Button, Card, Group, Modal, Paper, Select, Stack, Text, UnstyledButton } from '@mantine/core';
import { getStatusBadgeProps, type CameraStatusTone } from '@/lib/gds/presentation';
import type { TryOnSetup } from '@/lib/tryon/setup-resolution';

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
  setup: {
    setupId: string;
    setupName?: string | null;
    setupProfile?: string | null;
    setupSource?: string | null;
  } | null;
}

async function postDecision(id: string, action: 'approve' | 'reject') {
  const response = await fetch(`/api/admin/tryon-results/${id}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
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

async function postRerun(sourceJobId: string, setupId?: string) {
  const response = await fetch(`/api/admin/tryon-jobs/${sourceJobId}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(setupId ? { setupId } : {}),
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

function reviewTone(status: ModerationRow['reviewStatus']): CameraStatusTone {
  if (status === 'approved') return 'active' as const;
  if (status === 'rejected') return 'danger' as const;
  return 'warning' as const;
}

function reviewLabel(status: ModerationRow['reviewStatus']) {
  return status.replace(/_/g, ' ');
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
}: {
  row: ModerationRow;
  clickable?: boolean;
  onOpen?: () => void;
  onResultMissing?: () => void;
}) {
  const content = (
    <Box
      style={{
        position: 'relative',
        width: 'min(100%, 400px)',
        height: 300,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--mantine-color-gray-0)',
      }}
    >
      <PreviewImage
        src={row.imageUrl}
        alt="Final try-on result"
        width={400}
        height={300}
        objectFit="contain"
        onFailure={onResultMissing}
      />
    </Box>
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
  alt,
  label,
  onFailure,
}: {
  src: string | null | undefined;
  alt: string;
  label: string;
  onFailure?: () => void;
}) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {label}
      </Text>
      <Box
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '3 / 4',
          minHeight: 320,
          maxHeight: '70vh',
          borderRadius: 16,
          overflow: 'hidden',
          background: 'var(--mantine-color-gray-0)',
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
      </Box>
    </Stack>
  );
}

function ModerationActions({
  row,
  busyId,
  onDecision,
  onGreat,
}: {
  row: ModerationRow;
  busyId: string | null;
  onDecision: (rowId: string, action: 'approve' | 'reject') => Promise<void>;
  onGreat: (row: ModerationRow) => Promise<void>;
}) {
  const isApproved = row.reviewStatus === 'approved';
  const isRejected = row.reviewStatus === 'rejected';

  return (
    <Group justify="stretch" gap="xs" wrap="wrap" style={{ width: '100%' }}>
      <Button
        variant="light"
        loading={busyId === `${row.id}:approve`}
        aria-label={isApproved ? 'Try-on result approved' : 'Approve try-on result'}
        onClick={() => void onDecision(row.id, 'approve')}
        style={{ flex: 1 }}
      >
        {isApproved ? 'Approved' : 'Approve'}
      </Button>
      <Button
        variant={row.isGreat ? 'default' : 'outline'}
        loading={busyId === `${row.id}:great`}
        aria-label={row.isGreat ? 'Remove from Greatest Hits' : 'Mark try-on result as Great'}
        onClick={() => void onGreat(row)}
        style={{ flex: 1 }}
      >
        {row.isGreat ? 'Remove Great' : 'Great'}
      </Button>
      <Button
        variant="light"
        loading={busyId === `${row.id}:reject`}
        aria-label={isRejected ? 'Try-on result rejected' : 'Reject try-on result'}
        onClick={() => void onDecision(row.id, 'reject')}
        style={{ flex: 1 }}
      >
        {isRejected ? 'Rejected' : 'Reject'}
      </Button>
    </Group>
  );
}

export default function TryOnResultModerationTable({
  rows,
  setupOptions = [],
  autoRefresh = false,
  emptyTitle = 'No try-on results need review',
  emptyDescription = 'Generated try-on results will appear here after the local worker uploads them back to Camera.',
}: {
  rows: ModerationRow[];
  setupOptions?: TryOnSetup[];
  autoRefresh?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [displayRows, setDisplayRows] = useState(rows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastRefreshLabel, setLastRefreshLabel] = useState<string | null>(null);
  const [selectedSetupByRow, setSelectedSetupByRow] = useState<Record<string, string>>({});
  const [rerunFeedbackByRow, setRerunFeedbackByRow] = useState<Record<string, string>>({});
  const [assetHealth, setAssetHealth] = useState<
    Record<string, { resultMissing?: boolean; originalMissing?: boolean }>
  >({});
  const knownRowIdsRef = useRef(new Set(rows.map((row) => row.id)));
  const isPollingRef = useRef(false);

  const activeRow = displayRows.find((row) => row.id === activeRowId) ?? null;
  const setupsById = useMemo(() => makeSetupDisplayMap(setupOptions), [setupOptions]);
  const defaultSetupId = setupOptions[0]?.setupId ?? '';

  useEffect(() => {
    setDisplayRows(rows);
    knownRowIdsRef.current = new Set(rows.map((row) => row.id));
  }, [rows]);

  const refreshRows = useCallback(async () => {
    if (!autoRefresh || isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const response = await fetch('/api/admin/tryon-results?reviewStatus=pending_review&limit=100', {
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
  }, [autoRefresh, router, soundEnabled]);

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

  async function handleDecision(rowId: string, action: 'approve' | 'reject') {
    try {
      setBusyId(`${rowId}:${action}`);
      await postDecision(rowId, action);
      if (activeRowId === rowId) {
        setActiveRowId(null);
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleGreat(row: ModerationRow) {
    try {
      setBusyId(`${row.id}:great`);
      await postGreat(row.id, row.isGreat);
      if (activeRowId === row.id && !row.isGreat) {
        setActiveRowId(null);
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function selectedSetupIdForRow(row: ModerationRow) {
    if (selectedSetupByRow[row.id]) {
      return selectedSetupByRow[row.id];
    }
    if (row.setup?.setupId && setupOptions.some((setup) => setup.setupId === row.setup?.setupId)) {
      return row.setup.setupId;
    }
    return defaultSetupId;
  }

  async function handleRerun(row: ModerationRow) {
    if (!row.sourceJobId) return;

    const selectedSetupId = selectedSetupIdForRow(row);
    try {
      setBusyId(`${row.id}:rerun`);
      const result = await postRerun(row.sourceJobId, selectedSetupId || undefined);
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
      router.refresh();
    } finally {
      setBusyId(null);
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
        <Button
          variant="outline"
          size="xs"
          loading={busyId === `${row.id}:rerun`}
          disabled={!row.sourceJobId || setupOptions.length === 0}
          aria-label={`Submit try-on job again for ${resolveDisplayName(row.userName)}`}
          onClick={() => void handleRerun(row)}
        >
          Submit again
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
      <ResponsiveDataView
        data={displayRows}
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
              />
            ),
          },
          {
            key: 'quickActions',
            label: 'Actions',
            render: (row) => (
              <ModerationActions row={row} busyId={busyId} onDecision={handleDecision} onGreat={handleGreat} />
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
                <Text size="xs" c="dimmed">
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
            key: 'preset',
            label: 'Preset Used',
            render: (row) => renderPresetControls(row),
          },
          {
            key: 'status',
            label: 'Review Status',
            render: (row) => (
              <Stack gap="xs" align="flex-start">
                <StatusBadge {...getStatusBadgeProps(reviewTone(row.reviewStatus), reviewLabel(row.reviewStatus))} />
                {row.isGreat ? (
                  <StatusBadge {...getStatusBadgeProps('active', 'Great')} />
                ) : null}
                <Text size="xs" c="dimmed">
                  {visibilityLabel(row)}
                </Text>
                {row.approvedAt ? (
                  <Text size="xs" c="dimmed">
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
          <Card withBorder padding="md">
            <Stack gap="md">
              <Stack gap="sm">
                <PreviewStrip
                  row={row}
                  clickable
                  onOpen={() => setActiveRowId(row.id)}
                  onResultMissing={() => markAssetMissing(row.id, 'resultMissing')}
                />
                <ModerationActions row={row} busyId={busyId} onDecision={handleDecision} onGreat={handleGreat} />
              </Stack>
              <Stack gap={2}>
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
              </Stack>
              {renderPresetControls(row)}
              <Stack gap="xs" align="flex-start">
                <StatusBadge {...getStatusBadgeProps(reviewTone(row.reviewStatus), reviewLabel(row.reviewStatus))} />
                {row.isGreat ? (
                  <StatusBadge {...getStatusBadgeProps('active', 'Great')} />
                ) : null}
                <Text size="xs" c="dimmed">
                  {visibilityLabel(row)}
                </Text>
                {assetHealthLabel(row.id) ? (
                  <Text size="xs" c="dimmed">
                    {assetHealthLabel(row.id)}
                  </Text>
                ) : null}
              </Stack>
            </Stack>
          </Card>
        )}
        getRowKey={(row) => row.id}
      />

      <Modal
        opened={Boolean(activeRow)}
        onClose={() => setActiveRowId(null)}
        title={activeRow ? `Review result for ${resolveDisplayName(activeRow.userName)}` : 'Review result'}
        size="90rem"
        centered
      >
        {activeRow ? (
          <Stack gap="lg">
            <ReviewImagePanel
              src={activeRow.imageUrl}
              alt="Final try-on result"
              label="Final result"
              onFailure={() => markAssetMissing(activeRow.id, 'resultMissing')}
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
            <Stack gap="xs" align="flex-start">
              <StatusBadge {...getStatusBadgeProps(reviewTone(activeRow.reviewStatus), reviewLabel(activeRow.reviewStatus))} />
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
            <ModerationActions row={activeRow} busyId={busyId} onDecision={handleDecision} onGreat={handleGreat} />
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}
