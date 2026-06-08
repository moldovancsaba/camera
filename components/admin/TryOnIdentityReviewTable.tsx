'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Stack, Text, TextInput } from '@/components/gds/PublicPrimitives';
import { ResponsiveDataView } from '@doneisbetter/gds-admin/client';
import { StatusBadge } from '@doneisbetter/gds-core/client';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

export interface IdentityReviewRow {
  id: string;
  eventName: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  classificationStatus: string;
  actionable: boolean;
}

async function patchIdentity(submissionId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/admin/tryon-identities/${submissionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to update identity');
  }
}

function IdentityActions({ row }: { row: IdentityReviewRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  async function markReviewed() {
    try {
      setBusy(true);
      await patchIdentity(row.id, { action: 'mark_reviewed_unrecoverable' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function correctIdentity() {
    try {
      setBusy(true);
      await patchIdentity(row.id, {
        action: 'correct_identity',
        userName: userName.trim() || undefined,
        userEmail: userEmail.trim() || undefined,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!row.actionable) {
    return (
      <Text size="xs" c="dimmed">
        {row.classificationStatus.replace(/_/g, ' ')}
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <TextInput
          placeholder="Name"
          value={userName}
          onChange={(event) => setUserName(event.currentTarget.value)}
          size="xs"
        />
        <TextInput
          placeholder="Email"
          value={userEmail}
          onChange={(event) => setUserEmail(event.currentTarget.value)}
          size="xs"
        />
      </Group>
      <Group gap="xs">
        <Button size="xs" variant="light" loading={busy} onClick={() => void correctIdentity()}>
          Correct
        </Button>
        <Button size="xs" variant="outline" loading={busy} onClick={() => void markReviewed()}>
          Mark reviewed
        </Button>
      </Group>
    </Stack>
  );
}

type IdentityReviewTableRow = IdentityReviewRow & Record<string, unknown>;

export default function TryOnIdentityReviewTable({ rows }: { rows: IdentityReviewRow[] }) {
  const tableRows: IdentityReviewTableRow[] = rows.map((row) => ({ ...row }));
  return (
    <ResponsiveDataView<IdentityReviewTableRow>
      data={tableRows}
      columns={[
        {
          key: 'identity',
          label: 'Identity',
          render: (row) => (
            <Stack gap={2}>
              <Text fw={600}>{row.userName}</Text>
              {row.userEmail ? (
                <Text size="sm" c="dimmed">
                  {row.userEmail}
                </Text>
              ) : null}
            </Stack>
          ),
        },
        {
          key: 'event',
          label: 'Event',
          render: (row) => <Text size="sm">{row.eventName || 'Unscoped event'}</Text>,
        },
        {
          key: 'status',
          label: 'Status',
          render: (row) => (
            <StatusBadge
              {...getStatusBadgeProps(row.actionable ? 'warning' : 'inactive', row.classificationStatus.replace(/_/g, ' '))}
            />
          ),
        },
        {
          key: 'actions',
          label: 'Actions',
          render: (row) => <IdentityActions row={row} />,
        },
      ]}
      renderCard={(row) => (
        <Stack gap="sm">
          <Text fw={700}>{row.userName}</Text>
          <Text size="sm" c="dimmed">
            {row.eventName || 'Unscoped event'}
          </Text>
          <IdentityActions row={row} />
        </Stack>
      )}
      getRowKey={(row) => String(row.id)}
    />
  );
}
