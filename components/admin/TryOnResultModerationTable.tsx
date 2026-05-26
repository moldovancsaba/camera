'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@/components/gds/ui';
import DataTable from '@/components/gds/DataTable';
import StateBlock from '@/components/gds/StateBlock';

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
              <button
                type="button"
                onClick={() => setActiveRowId(row.id)}
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
                <Group align="flex-start" gap="sm" wrap="nowrap">
                  <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 12, overflow: 'hidden', background: 'var(--mantine-color-gray-1)' }}>
                    <Image src={row.imageUrl} alt="Generated try-on result" fill unoptimized style={{ objectFit: 'cover' }} />
                  </div>
                  {row.originalImageUrl ? (
                    <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: 'var(--mantine-color-gray-1)' }}>
                      <Image src={row.originalImageUrl} alt="Original camera result" fill unoptimized style={{ objectFit: 'cover' }} />
                    </div>
                  ) : null}
                </Group>
              </button>
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
                <Text>{row.eventName || 'Unscoped event'}</Text>
                <Text size="sm" c="dimmed">
                  {row.partnerName || 'No partner'}
                </Text>
              </Stack>
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              <Text size="sm">{row.tryOnLeatherSuitId || 'Unknown suit'}</Text>
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top' }}>
              <Stack gap={2}>
                <Text fw={700} tt="capitalize">
                  {row.reviewStatus.replace(/_/g, ' ')}
                </Text>
                <Text size="xs" c="dimmed">
                  Share: {row.isShareVisible ? 'Visible' : 'Hidden'} · Slideshow: {row.isSlideshowEligible ? 'Eligible' : 'Hidden'}
                </Text>
                {row.approvedAt ? (
                  <Text size="xs" c="dimmed">
                    Approved {new Date(row.approvedAt).toLocaleString()}
                  </Text>
                ) : null}
              </Stack>
            </td>
            <td style={{ padding: '1rem 1.5rem', verticalAlign: 'top', textAlign: 'right' }}>
              <Group justify="flex-end" gap="xs">
                <Button
                  variant="light"
                  color="green"
                  loading={busyId === `${row.id}:approve`}
                  aria-label="Approve try-on result"
                  onClick={() => void handleDecision(row.id, 'approve')}
                >
                  Approve
                </Button>
                <Button
                  variant="light"
                  color="red"
                  loading={busyId === `${row.id}:reject`}
                  aria-label="Reject try-on result"
                  onClick={() => void handleDecision(row.id, 'reject')}
                >
                  Reject
                </Button>
              </Group>
            </td>
          </tr>
        ))}
      </DataTable>

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
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 16, overflow: 'hidden', background: 'var(--mantine-color-gray-1)' }}>
                  <Image src={activeRow.imageUrl} alt="Generated try-on result" fill unoptimized style={{ objectFit: 'contain' }} />
                </div>
              </Stack>
              {activeRow.originalImageUrl ? (
                <Stack gap="xs">
                  <Text fw={700}>Original camera result</Text>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 16, overflow: 'hidden', background: 'var(--mantine-color-gray-1)' }}>
                    <Image src={activeRow.originalImageUrl} alt="Original camera result" fill unoptimized style={{ objectFit: 'contain' }} />
                  </div>
                </Stack>
              ) : null}
            </Group>

            <Stack gap={4}>
              <Text fw={700}>{activeRow.userName}</Text>
              <Text size="sm" c="dimmed">
                {activeRow.userEmail}
              </Text>
              <Text size="sm">
                {activeRow.eventName || 'Unscoped event'} · {activeRow.partnerName || 'No partner'}
              </Text>
              <Text size="sm" c="dimmed">
                Leather suit: {activeRow.tryOnLeatherSuitId || 'Unknown suit'}
              </Text>
            </Stack>

            <Group justify="flex-end" gap="sm">
              <Button
                variant="light"
                color="red"
                loading={busyId === `${activeRow.id}:reject`}
                onClick={() => void handleDecision(activeRow.id, 'reject')}
              >
                Reject
              </Button>
              <Button
                variant="light"
                color="green"
                loading={busyId === `${activeRow.id}:approve`}
                onClick={() => void handleDecision(activeRow.id, 'approve')}
              >
                Approve
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </>
  );
}
