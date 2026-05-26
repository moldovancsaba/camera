'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';
import { Button, Group, Stack, Text } from '@/components/gds/ui';
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
                onClick={async () => {
                  try {
                    setBusyId(`${row.id}:approve`);
                    await postDecision(row.id, 'approve');
                    router.refresh();
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                Approve
              </Button>
              <Button
                variant="light"
                color="red"
                loading={busyId === `${row.id}:reject`}
                aria-label="Reject try-on result"
                onClick={async () => {
                  try {
                    setBusyId(`${row.id}:reject`);
                    await postDecision(row.id, 'reject');
                    router.refresh();
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                Reject
              </Button>
            </Group>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
