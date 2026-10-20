'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ListingCard, type ListingMetadataRow } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import type { FanmassEventPhoto, FanmassQueueStatus } from '@/lib/fanmass/photo-results';

const STATUS_LABEL: Record<FanmassQueueStatus, string> = {
  awaiting: 'Waiting for Fanmass',
  queued: 'Queued',
  leased: 'Starting',
  processing: 'In progress',
  retry: 'Retrying',
  completed: 'Fanmass analysed',
  result_missing: 'Result missing',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function FanmassPhotoResultsList({ eventId, items }: { eventId: string; items: FanmassEventPhoto[] }) {
  if (items.length === 0) {
    return <p style={{ color: 'var(--mantine-color-dimmed)' }}>No photos are currently eligible for Fanmass analysis.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }} data-fanmass-photo-results>
      {items.map((item) => {
        const metadata: ListingMetadataRow[] = [
          { id: 'fanmass-status', label: 'Fanmass', value: STATUS_LABEL[item.queueStatus], tone: item.queueStatus === 'failed' || item.queueStatus === 'result_missing' ? 'warning' : item.queueStatus === 'completed' ? 'positive' : 'muted' },
          { id: 'people-estimate', label: 'People estimate', value: item.result ? String(item.result.summary.personCount) : '—', tone: 'muted' },
          { id: 'people-boxes', label: 'People boxes', value: item.result ? String(item.result.boxes.people.length) : '—', tone: 'muted' },
          { id: 'human-confirmation', label: 'Human check', value: item.confirmed ? 'Confirmed' : item.result ? 'Needs review' : 'Not ready', tone: item.confirmed ? 'positive' : 'muted' },
        ];
        if (item.queueUpdatedAt) metadata.push({ id: 'queue-updated-at', label: 'Queue updated', value: formatDateTime(item.queueUpdatedAt), tone: 'muted' });
        if (item.result?.analyzedAt) metadata.push({ id: 'analyzed-at', label: 'Analysed at', value: formatDateTime(item.result.analyzedAt), tone: 'muted' });
        if (item.errorCode) metadata.push({ id: 'error', label: 'Issue', value: item.errorCode, tone: 'warning' });

        return (
          <ListingCard
            key={item.id}
            title={`Photo ${item.submissionId}`}
            image={item.photoUrl
              ? <Image src={item.photoUrl} alt="Original event photo" width={800} height={600} unoptimized style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} />
              : <div style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', color: 'var(--mantine-color-dimmed)' }}>Photo unavailable</div>}
            metadata={metadata}
            actions={[
              <Link key="review" href={`/admin/events/${eventId}/analysis/fanmass/review?photo=${encodeURIComponent(item.id)}`} style={{ textDecoration: 'none' }}>
                <SemanticButton action="photo-analysis:edit" type="button" size="xs" variant="secondary">Review Fanmass result</SemanticButton>
              </Link>,
            ]}
          />
        );
      })}
    </div>
  );
}
