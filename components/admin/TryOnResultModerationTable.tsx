'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import DataTable from '@/components/gds/DataTable';
import ResponsiveDataView from '@/components/gds/ResponsiveDataView';
import StateBlock from '@/components/gds/StateBlock';
import StatusBadge from '@/components/gds/StatusBadge';
import { Button, Card, Group, Modal, Stack, Text } from '@/components/gds/ui';

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

function reviewTone(status: ModerationRow['reviewStatus']) {
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

function PreviewStrip({
  row,
  clickable,
  onOpen,
}: {
  row: ModerationRow;
  clickable?: boolean;
  onOpen?: () => void;
}) {
  const content = (
    <Group align="flex-start" gap="sm" wrap="nowrap">
      <div
        style={{
          position: 'relative',
          width: 96,
          height: 96,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--mantine-color-gray-1)',
          flexShrink: 0,
        }}
      >
        <Image src={row.imageUrl} alt="Generated try-on result" fill unoptimized style={{ objectFit: 'cover' }} />
      </div>
      {row.originalImageUrl ? (
        <div
          style={{
            position: 'relative',
            width: 72,
            height: 72,
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--mantine-color-gray-1)',
            flexShrink: 0,
          }}
        >
          <Image src={row.originalImageUrl} alt="Original camera result" fill unoptimized style={{ objectFit: 'cover' }} />
        </div>
      ) : null}
    </Group>
  );

  if (!clickable) return content;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'block',
        padding: 0,
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      aria-label={`Open review modal for ${row.userName}`}
    >
      {content}
    </button>
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
        color="green"
        loading={busyId === `${row.id}:approve`}
        aria-label="Approve try-on result"
        onClick={() => void onDecision(row.id, 'approve')}
      >
        Approve
      </Button>
      <Button
        variant="light"
        color="red"
        loading={busyId === `${row.id}:reject`}
        aria-label="Reject try-on result"
        onClick={() => void onDecision(row.id, 'reject')}
      >
        Reject
      </Button>
    </Group>
  );
}

export default function TryOnResultModerationTable({ rows }: { rows: ModerationRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const activeRow = rows.find((row) => row.id === activeRowId) ?? null;

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
        title="No try-on results need review"
        description="Generated try-on results will appear here after the local worker uploads them back to Camera."
      />
    );
  }

  return (
    <>
      <ResponsiveDataView
        table={
          <DataTable
            columns={[
              { key: 'preview', title: 'Preview' },
              { key: 'user', title: 'User' },
              { key: 'scope', title: 'Event / Partner' },
              { key: 'suit', title: 'Leather Suit' },
              { key: 'status', title: 'Review Status' },
              { key: 'actions', title: 'Actions', align: 'right' },
            ]}
          >
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <PreviewStrip row={row} clickable onOpen={() => setActiveRowId(row.id)} />
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <Stack gap={2}>
                    <Text fw={700}>{row.userName}</Text>
                    <Text size="sm" c="dimmed">
                      {row.userEmail}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {new Date(row.createdAt).toLocaleString()}
                    </Text>
                  </Stack>
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <Stack gap={2}>
                    <Text>{scopeLabel(row)}</Text>
                    <Text size="sm" c="dimmed">
                      {row.partnerName || 'No partner'}
                    </Text>
                  </Stack>
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <Text size="sm">{row.tryOnLeatherSuitId || 'Unknown suit'}</Text>
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
                  <Stack gap="xs" align="flex-start">
                    <StatusBadge tone={reviewTone(row.reviewStatus)} label={reviewLabel(row.reviewStatus)} />
                    <Text size="xs" c="dimmed">
                      {visibilityLabel(row)}
                    </Text>
                    {row.approvedAt ? (
                      <Text size="xs" c="dimmed">
                        Approved {new Date(row.approvedAt).toLocaleString()}
                      </Text>
                    ) : null}
                  </Stack>
                </td>
                <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top', textAlign: 'right' }}>
                  <ModerationActions row={row} busyId={busyId} onDecision={handleDecision} />
                </td>
              </tr>
            ))}
          </DataTable>
        }
        mobile={
          <>
            {rows.map((row) => (
              <Card key={row.id} withBorder radius="md">
                <Stack gap="md">
                  <PreviewStrip row={row} clickable onOpen={() => setActiveRowId(row.id)} />
                  <Group justify="space-between" align="flex-start" gap="sm">
                    <Stack gap={2}>
                      <Text fw={700}>{row.userName}</Text>
                      <Text size="sm" c="dimmed">
                        {row.userEmail}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {new Date(row.createdAt).toLocaleString()}
                      </Text>
                    </Stack>
                    <StatusBadge tone={reviewTone(row.reviewStatus)} label={reviewLabel(row.reviewStatus)} />
                  </Group>
                  <Stack gap={2}>
                    <Text size="sm" fw={600}>
                      {scopeLabel(row)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {row.partnerName || 'No partner'}
                    </Text>
                    <Text size="sm">{row.tryOnLeatherSuitId || 'Unknown suit'}</Text>
                    <Text size="xs" c="dimmed">
                      {visibilityLabel(row)}
                    </Text>
                    {row.approvedAt ? (
                      <Text size="xs" c="dimmed">
                        Approved {new Date(row.approvedAt).toLocaleString()}
                      </Text>
                    ) : null}
                  </Stack>
                  <ModerationActions row={row} busyId={busyId} onDecision={handleDecision} />
                </Stack>
              </Card>
            ))}
          </>
        }
      />

      <Modal
        opened={Boolean(activeRow)}
        onClose={() => setActiveRowId(null)}
        title={activeRow ? `Review try-on result for ${activeRow.userName}` : 'Review try-on result'}
        centered
        size="xl"
      >
        {activeRow ? (
          <Stack gap="lg">
            <Group align="flex-start" grow>
              <Stack gap="xs">
                <Text fw={700}>Generated result</Text>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 16,
                    overflow: 'hidden',
                    background: 'var(--mantine-color-gray-1)',
                  }}
                >
                  <Image src={activeRow.imageUrl} alt="Generated try-on result" fill unoptimized style={{ objectFit: 'contain' }} />
                </div>
              </Stack>
              {activeRow.originalImageUrl ? (
                <Stack gap="xs">
                  <Text fw={700}>Original camera result</Text>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 16,
                      overflow: 'hidden',
                      background: 'var(--mantine-color-gray-1)',
                    }}
                  >
                    <Image src={activeRow.originalImageUrl} alt="Original camera result" fill unoptimized style={{ objectFit: 'contain' }} />
                  </div>
                </Stack>
              ) : null}
            </Group>

            <Stack gap="xs">
              <Group gap="sm">
                <Text fw={700}>{activeRow.userName}</Text>
                <StatusBadge tone={reviewTone(activeRow.reviewStatus)} label={reviewLabel(activeRow.reviewStatus)} />
              </Group>
              <Text size="sm" c="dimmed">
                {activeRow.userEmail}
              </Text>
              <Text size="sm">
                {scopeLabel(activeRow)} · {activeRow.partnerName || 'No partner'}
              </Text>
              <Text size="sm" c="dimmed">
                Leather suit: {activeRow.tryOnLeatherSuitId || 'Unknown suit'}
              </Text>
              <Text size="sm" c="dimmed">
                {visibilityLabel(activeRow)}
              </Text>
            </Stack>

            <ModerationActions row={activeRow} busyId={busyId} onDecision={handleDecision} />
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}
