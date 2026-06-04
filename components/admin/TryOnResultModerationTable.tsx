'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';
import { StateBlock, StatusBadge } from '@doneisbetter/gds-core/client';
import { Box, Button, Card, Group, Modal, Paper, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { getStatusBadgeProps, type CameraStatusTone } from '@/lib/gds/presentation';

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
  imageUrl: string;
  originalImageUrl: string | null;
  userName: string;
  userEmail: string;
  eventName: string | null;
  partnerName: string | null;
  tryOnLeatherSuitId: string | null;
  reviewStatus: 'pending_review' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt: string | null;
  isShareVisible: boolean;
  isSlideshowEligible: boolean;
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
  const content = (
    <Group align="flex-start" gap="sm" wrap="nowrap">
      <Box
        style={{
          position: 'relative',
          width: 96,
          height: 96,
          borderRadius: 12,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <PreviewImage
          src={row.imageUrl}
          alt="Generated try-on result"
          width={96}
          height={96}
          onFailure={onResultMissing}
        />
      </Box>
      {row.originalImageUrl ? (
        <Box
          style={{
            position: 'relative',
            width: 72,
            height: 72,
            borderRadius: 12,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <PreviewImage
            src={row.originalImageUrl}
            alt="Original camera result"
            width={72}
            height={72}
            onFailure={onOriginalMissing}
          />
        </Box>
      ) : null}
    </Group>
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
}: {
  row: ModerationRow;
  busyId: string | null;
  onDecision: (rowId: string, action: 'approve' | 'reject') => Promise<void>;
}) {
  return (
    <Group justify="flex-end" gap="xs" wrap="wrap">
      <Button
        variant="light"
        loading={busyId === `${row.id}:approve`}
        aria-label="Approve try-on result"
        onClick={() => void onDecision(row.id, 'approve')}
      >
        Approve
      </Button>
      <Button
        variant="light"
        loading={busyId === `${row.id}:reject`}
        aria-label="Reject try-on result"
        onClick={() => void onDecision(row.id, 'reject')}
      >
        Reject
      </Button>
    </Group>
  );
}

export default function TryOnResultModerationTable({
  rows,
  emptyTitle = 'No try-on results need review',
  emptyDescription = 'Generated try-on results will appear here after the local worker uploads them back to Camera.',
}: {
  rows: ModerationRow[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [assetHealth, setAssetHealth] = useState<
    Record<string, { resultMissing?: boolean; originalMissing?: boolean }>
  >({});

  const activeRow = rows.find((row) => row.id === activeRowId) ?? null;

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

  if (rows.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      <ResponsiveDataView
        data={rows}
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
            key: 'user',
            label: 'User',
            render: (row) => (
              <Stack gap={2}>
                <Text fw={700}>{resolveDisplayName(row.userName)}</Text>
                <Text size="sm" c="dimmed">
                  {row.userEmail}
                </Text>
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
            label: 'Leather Suit',
            render: (row) => <Text size="sm">{row.tryOnLeatherSuitId || 'Unknown suit'}</Text>,
          },
          {
            key: 'status',
            label: 'Review Status',
            render: (row) => (
              <Stack gap="xs" align="flex-start">
                <StatusBadge {...getStatusBadgeProps(reviewTone(row.reviewStatus), reviewLabel(row.reviewStatus))} />
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
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <ModerationActions row={row} busyId={busyId} onDecision={handleDecision} />
            ),
          },
        ]}
        renderCard={(row) => (
          <Card withBorder padding="md">
            <Stack gap="md">
              <PreviewStrip
                row={row}
                clickable
                onOpen={() => setActiveRowId(row.id)}
                onResultMissing={() => markAssetMissing(row.id, 'resultMissing')}
                onOriginalMissing={() => markAssetMissing(row.id, 'originalMissing')}
              />
              <Stack gap={2}>
              <Text fw={700}>{resolveDisplayName(row.userName)}</Text>
                <Text size="sm" c="dimmed">
                  {row.userEmail}
                </Text>
                <Text size="xs" c="dimmed">
                  {scopeLabel(row)} · {row.partnerName || 'No partner'}
                </Text>
                <Text size="xs" c="dimmed">
                  {row.tryOnLeatherSuitId || 'Unknown suit'}
                </Text>
              </Stack>
              <Stack gap="xs" align="flex-start">
                <StatusBadge {...getStatusBadgeProps(reviewTone(row.reviewStatus), reviewLabel(row.reviewStatus))} />
                <Text size="xs" c="dimmed">
                  {visibilityLabel(row)}
                </Text>
                {assetHealthLabel(row.id) ? (
                  <Text size="xs" c="dimmed">
                    {assetHealthLabel(row.id)}
                  </Text>
                ) : null}
              </Stack>
              <ModerationActions row={row} busyId={busyId} onDecision={handleDecision} />
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
            <SimpleGrid cols={{ base: 1, md: activeRow.originalImageUrl ? 2 : 1 }} spacing="lg">
              <ReviewImagePanel
                src={activeRow.imageUrl}
                alt="Generated try-on result"
                label="Generated result"
                onFailure={() => markAssetMissing(activeRow.id, 'resultMissing')}
              />
              {activeRow.originalImageUrl ? (
                <ReviewImagePanel
                  src={activeRow.originalImageUrl}
                  alt="Original camera result"
                  label="Original capture"
                  onFailure={() => markAssetMissing(activeRow.id, 'originalMissing')}
                />
              ) : null}
            </SimpleGrid>
            <Stack gap={4}>
              <Text fw={700}>{resolveDisplayName(activeRow.userName)}</Text>
              <Text size="sm" c="dimmed">
                {activeRow.userEmail}
              </Text>
              <Text size="sm">
                {scopeLabel(activeRow)} · {activeRow.partnerName || 'No partner'}
              </Text>
              <Text size="sm" c="dimmed">
                {activeRow.tryOnLeatherSuitId || 'Unknown suit'}
              </Text>
            </Stack>
            <Stack gap="xs" align="flex-start">
              <StatusBadge {...getStatusBadgeProps(reviewTone(activeRow.reviewStatus), reviewLabel(activeRow.reviewStatus))} />
              <Text size="sm" c="dimmed">
                {visibilityLabel(activeRow)}
              </Text>
              {assetHealthLabel(activeRow.id) ? (
                <Text size="sm" c="dimmed">
                  {assetHealthLabel(activeRow.id)}
                </Text>
              ) : null}
            </Stack>
            <ModerationActions row={activeRow} busyId={busyId} onDecision={handleDecision} />
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}
