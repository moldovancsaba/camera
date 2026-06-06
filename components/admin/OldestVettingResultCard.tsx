'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import type { ModerationRow } from '@/components/admin/TryOnResultModerationTable';

function resolveDisplayName(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const isEventGuest = normalized.toLowerCase() === 'event guest';
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);

  if (normalized && !isEventGuest && !isEmail) {
    return normalized;
  }
  return 'Guest';
}

function shouldShowEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && normalized !== 'anonymous@event' && normalized !== 'anonymous@event.com';
}

function garmentLabel(row: ModerationRow) {
  return row.tryOnLeatherSuitName || row.tryOnLeatherSuitId || 'Unknown garment';
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

export default function OldestVettingResultCard({ row }: { row: ModerationRow }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<'approve' | 'great' | 'reject' | null>(null);

  async function handleDecision(action: 'approve' | 'reject') {
    try {
      setBusyAction(action);
      await postDecision(row.id, action);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function handleGreat() {
    try {
      setBusyAction('great');
      await postGreat(row.id, row.isGreat);
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--mantine-color-violet-2), var(--mantine-color-cyan-1))',
        borderRadius: 24,
        boxShadow: '0 18px 42px rgba(109, 40, 217, 0.18), 0 0 0 1px rgba(109, 40, 217, 0.18)',
        color: 'inherit',
        marginBottom: 'var(--mantine-spacing-xl)',
        padding: 3,
      }}
    >
      <div
        style={{
          background: 'var(--mantine-color-body)',
          borderRadius: 21,
          overflow: 'hidden',
        }}
      >
        <img
          src={row.imageUrl}
          alt="Oldest waiting try-on result"
          style={{
            aspectRatio: '4 / 5',
            background: 'var(--mantine-color-gray-0)',
            display: 'block',
            objectFit: 'contain',
            width: '100%',
          }}
        />
        <Stack gap="sm" p="md">
          <Stack gap={2}>
            <Text size="xs" fw={800} tt="uppercase" style={{ letterSpacing: '0.08em' }}>
              Oldest waiting
            </Text>
            <Text size="lg" fw={800}>
              {resolveDisplayName(row.userName)}
            </Text>
            {shouldShowEmail(row.userEmail) ? (
              <Text size="sm" c="dimmed">
                {row.userEmail}
              </Text>
            ) : null}
            <Text size="sm" c="dimmed">
              {row.eventName || 'Unscoped event'} · {garmentLabel(row)}
            </Text>
            <Text size="sm" c="dimmed">
              Created {new Date(row.createdAt).toLocaleString()}
            </Text>
          </Stack>
          <Group justify="stretch" gap="xs" wrap="wrap" style={{ width: '100%' }}>
            <Button
              variant="light"
              loading={busyAction === 'approve'}
              onClick={() => void handleDecision('approve')}
              style={{ flex: 1 }}
            >
              Approve
            </Button>
            <Button
              variant={row.isGreat ? 'default' : 'outline'}
              loading={busyAction === 'great'}
              onClick={() => void handleGreat()}
              style={{ flex: 1 }}
            >
              {row.isGreat ? 'Remove Great' : 'Great'}
            </Button>
            <Button
              variant="light"
              loading={busyAction === 'reject'}
              onClick={() => void handleDecision('reject')}
              style={{ flex: 1 }}
            >
              Decline
            </Button>
          </Group>
        </Stack>
      </div>
    </div>
  );
}
