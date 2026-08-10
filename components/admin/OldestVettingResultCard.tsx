'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { ListingCard, type ListingMetadataRow } from '@sovereignsquad/gds-core/client';
import Image from 'next/image';
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

  const previewSrc = row.previewImageUrl ?? row.imageUrl;

  useEffect(() => {
    if (!previewSrc) return;
    const image = document.createElement('img');
    image.decoding = 'async';
    image.src = previewSrc;
  }, [previewSrc]);

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

  // ponytail: 4:5 ratio kept inside the image node — ListingCard.mediaRatio only offers 1:1/4:3/16:9,
  // but image is a ReactNode so objectFit:contain preserves the non-cropping contract regardless.
  // Event and garment kept as separate rows: ListingCard's metadata value side has no
  // truncation, so a combined "event · garment" string can overflow the nowrap row.
  const metadata: ListingMetadataRow[] = [];
  if (shouldShowEmail(row.userEmail)) {
    metadata.push({ id: 'email', label: 'Email', value: row.userEmail, tone: 'muted' });
  }
  metadata.push({ id: 'event', label: 'Event', value: row.eventName || 'Unscoped event' });
  metadata.push({ id: 'garment', label: 'Garment', value: garmentLabel(row), tone: 'muted' });
  metadata.push({ id: 'created', label: 'Created', value: new Date(row.createdAt).toLocaleString(), tone: 'muted' });

  return (
    <div style={{ marginBottom: 'var(--mantine-spacing-xl)' }}>
      <ListingCard
        // "Oldest waiting" carried in the title eyebrow, not `featured` — ListingCard's
        // featured badge text is hardcoded to "Featured" and would drop the domain meaning.
        title={
          <span style={{ display: 'grid', gap: 2 }}>
            <span style={{ color: 'var(--mantine-color-dimmed)', fontSize: 'var(--mantine-font-size-xs)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Oldest waiting
            </span>
            {resolveDisplayName(row.userName)}
          </span>
        }
        image={
          <Image
            src={previewSrc}
            alt="Oldest waiting try-on result"
            width={800}
            height={1000}
            unoptimized
            style={{
              aspectRatio: '4 / 5',
              background: 'var(--mantine-color-gray-0)',
              display: 'block',
              objectFit: 'contain',
              width: '100%',
              height: 'auto',
            }}
          />
        }
        metadata={metadata}
        actions={[
          <SemanticButton
            key="approve"
            action="tryon:approve"
            loading={busyAction === 'approve'}
            onClick={() => void handleDecision('approve')}
          >
            Approve
          </SemanticButton>,
          <SemanticButton
            key="reject"
            action="tryon:reject"
            loading={busyAction === 'reject'}
            onClick={() => void handleDecision('reject')}
          >
            Reject
          </SemanticButton>,
          <SemanticButton
            key="great"
            action="tryon:great"
            loading={busyAction === 'great'}
            onClick={() => void handleGreat()}
          >
            {row.isGreat ? 'Remove Great' : 'Great'}
          </SemanticButton>,
          <SemanticButton
            key="service"
            action="tryon:service"
            loading={busyAction === 'service'}
            onClick={() => void handleService()}
          >
            Service
          </SemanticButton>,
        ]}
      />
    </div>
  );
}
