'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

export default function OldestVettingResultCard({ row }: { row: ModerationRow }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<'approve' | 'great' | 'reject' | 'service' | null>(null);

  useEffect(() => {
    if (!row.imageUrl) return;
    const image = document.createElement('img');
    image.decoding = 'async';
    image.src = row.imageUrl;
  }, [row.imageUrl]);

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

  async function handleService() {
    try {
      setBusyAction('service');
      await postService(row.id);
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
        boxShadow:
          '0 18px 42px color-mix(in srgb, var(--mantine-color-violet-7) 18%, transparent), 0 0 0 1px color-mix(in srgb, var(--mantine-color-violet-7) 18%, transparent)',
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
        <div style={{ display: 'grid', gap: 'var(--mantine-spacing-sm)', padding: 'var(--mantine-spacing-md)' }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <strong style={{ fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Oldest waiting
            </strong>
            <strong style={{ fontSize: 'var(--mantine-font-size-lg)' }}>
              {resolveDisplayName(row.userName)}
            </strong>
            {shouldShowEmail(row.userEmail) ? (
              <span style={{ color: 'var(--mantine-color-dimmed)' }}>
                {row.userEmail}
              </span>
            ) : null}
            <span style={{ color: 'var(--mantine-color-dimmed)' }}>
              {row.eventName || 'Unscoped event'} · {garmentLabel(row)}
            </span>
            <span style={{ color: 'var(--mantine-color-dimmed)' }}>
              Created {new Date(row.createdAt).toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)' }}>
            <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)', gridTemplateColumns: '1fr 1fr' }}>
              <SemanticButton
                action="tryon:approve"
                loading={busyAction === 'approve'}
                onClick={() => void handleDecision('approve')}
              >
                Approve
              </SemanticButton>
              <SemanticButton
                action="tryon:reject"
                loading={busyAction === 'reject'}
                onClick={() => void handleDecision('reject')}
              >
                Reject
              </SemanticButton>
            </div>
            <div style={{ display: 'grid', gap: 'var(--mantine-spacing-xs)', gridTemplateColumns: '1fr 1fr' }}>
              <SemanticButton
                action="tryon:great"
                loading={busyAction === 'great'}
                onClick={() => void handleGreat()}
              >
                {row.isGreat ? 'Remove Great' : 'Great'}
              </SemanticButton>
              <SemanticButton
                action="tryon:service"
                loading={busyAction === 'service'}
                onClick={() => void handleService()}
              >
                Service
              </SemanticButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
