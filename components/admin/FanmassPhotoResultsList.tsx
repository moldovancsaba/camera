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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function objectCount(value: unknown): number {
  const row = asRecord(value);
  if (!row) return 0;
  return Object.values(row).reduce<number>((sum, count) => sum + asCount(typeof count === 'number' ? count : asRecord(count)?.count), 0);
}

function mentionCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.reduce((sum, item) => sum + asCount(asRecord(item)?.count), 0);
}

function moduleItemCount(value: unknown, include?: (item: Record<string, unknown>) => boolean): number {
  const row = asRecord(value);
  const items = Array.isArray(row?.items) ? row.items : [];
  return items.reduce((sum, item) => {
    const entry = asRecord(item);
    if (!entry || (include && !include(entry))) return sum;
    return sum + Math.max(1, asCount(entry.count));
  }, 0);
}

function resultMetricCount(result: NonNullable<FanmassEventPhoto['result']>, summaryKey: string, moduleKey: string, include?: (item: Record<string, unknown>) => boolean): number {
  const summaryValue = result.summary[summaryKey];
  if (Array.isArray(summaryValue)) return mentionCount(summaryValue);
  if (summaryValue && typeof summaryValue === 'object') return objectCount(summaryValue);
  return moduleItemCount(result.summary[moduleKey], include);
}

function moduleState(value: unknown): string {
  const row = asRecord(value);
  if (!row) return 'Not returned';
  const status = typeof row.status === 'string' ? row.status : '';
  if (status === 'completed') return row.flagged === true ? 'Completed · flagged' : 'Completed';
  if (status) return status;
  return Object.keys(row).length ? 'Data returned' : 'Not returned';
}

export default function FanmassPhotoResultsList({ eventId, items }: { eventId: string; items: FanmassEventPhoto[] }) {
  if (items.length === 0) {
    return <p style={{ color: 'var(--mantine-color-dimmed)' }}>No photos are currently eligible for Fanmass analysis.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }} data-fanmass-photo-results>
      {items.map((item) => {
        const hasCurrentCorrection = Boolean(item.result && item.correction?.sourceRevision === item.result.sourceRevision && item.correction.analysisGeneration === item.result.analysisGeneration);
        const result = item.result && hasCurrentCorrection
          ? { ...item.result, ...item.correction }
          : item.result;
        const metadata: ListingMetadataRow[] = [
          { id: 'fanmass-status', label: 'Fanmass', value: STATUS_LABEL[item.queueStatus], tone: item.queueStatus === 'failed' || item.queueStatus === 'result_missing' ? 'warning' : item.queueStatus === 'completed' ? 'positive' : 'muted' },
          { id: 'photo-taken-at', label: 'Photo taken', value: formatDateTime(item.createdAt), tone: 'muted' },
          { id: 'people-estimate', label: 'People estimate · model', value: result ? String(result.summary.personCount) : '—', tone: 'muted' },
          { id: 'people-boxes', label: 'Individual person boxes', value: result ? String(result.boxes.people.length) : '—', tone: 'muted' },
          { id: 'face-boxes', label: 'Face boxes', value: result ? String(result.boxes.faces.length) : '—', tone: 'muted' },
          { id: 'pose-count', label: 'Pose detections', value: result ? String(asCount(result.analysis.poseCount)) : '—', tone: 'muted' },
          { id: 'object-person-count', label: 'Object-model person detections', value: result ? String(asCount(asRecord(asRecord(result.analysis.detection)?.objects)?.personCount)) : '—', tone: 'muted' },
          { id: 'brand-appearances', label: 'Brand appearances', value: result ? String(resultMetricCount(result, 'brandMentions', 'fashionBrands')) : '—', tone: 'muted' },
          { id: 'club-appearances', label: 'Club appearances', value: result ? String(resultMetricCount(result, 'clubMentions', 'sportsMerchandise', (entry) => String(entry.entityType ?? '').toLowerCase() === 'club')) : '—', tone: 'muted' },
          { id: 'merchandise-detections', label: 'Merchandise detections', value: result ? String(resultMetricCount(result, 'merchandiseCounts', 'sportsMerchandise')) : '—', tone: 'muted' },
          { id: 'safety-status', label: 'Content safety', value: result ? moduleState(result.summary.moderation) : '—', tone: result && asRecord(result.summary.moderation)?.flagged === true ? 'warning' : 'muted' },
          { id: 'human-confirmation', label: 'Human check', value: item.confirmed ? 'Confirmed' : item.result ? 'Needs review' : 'Not ready', tone: item.confirmed ? 'positive' : 'muted' },
        ];
        if (hasCurrentCorrection) metadata.push({ id: 'human-correction', label: 'Human correction', value: 'Edited', tone: 'positive' });
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
                <SemanticButton action="photo-analysis:edit" type="button" size="xs" variant="secondary">Review / edit Fanmass analysis</SemanticButton>
              </Link>,
            ]}
          />
        );
      })}
    </div>
  );
}
