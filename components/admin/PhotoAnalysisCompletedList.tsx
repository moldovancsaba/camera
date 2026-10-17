'use client';

/** The already-analysed photos of one event, with direct links to correct a saved analysis. */

import Image from 'next/image';
import Link from 'next/link';
import { ListingCard, type ListingMetadataRow } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import type { PhotoAnalysisItem } from '@/lib/photo-vetting/queue';

function formatDateTime(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PhotoAnalysisCompletedList({ eventId, items }: { eventId: string; items: PhotoAnalysisItem[] }) {
  return (
    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' }} data-photo-analysis-completed>
      {items.map((item) => {
        const vetting = item.status === 'published' ? 'Published without vetting' : item.status === 'approved' ? 'Approved' : 'Rejected';
        const metadata: ListingMetadataRow[] = [
          { id: 'vetting', label: 'Vetting', value: vetting, tone: item.status === 'rejected' ? 'warning' : 'positive' },
          { id: 'analysed-at', label: 'Analysed', value: formatDateTime(item.analysisAt), tone: 'muted' },
          // A saved empty list means zero people; unreadable data needs a visible review state.
          { id: 'people-marked', label: 'People marked', value: item.peopleMarked ? item.peopleCount === null ? 'Review data' : String(item.peopleCount) : 'Not analysed', tone: item.peopleMarked && item.peopleCount !== null ? 'positive' : 'warning' },
        ];
        if (item.analysisBy) metadata.push({ id: 'analysed-by', label: 'By', value: item.analysisBy });
        if (item.email) metadata.unshift({ id: 'email', label: 'Email', value: item.email });
        return (
          <ListingCard
            key={item.id}
            title={item.name}
            image={item.analysisPhotoUrl ? <Image src={item.analysisPhotoUrl} alt={`Unframed photo of ${item.name}`} width={800} height={450} unoptimized style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} /> : <div style={{ aspectRatio: '16 / 9' }}>Unframed photo unavailable</div>}
            metadata={metadata}
            actions={[
              <Link key="edit" href={`/admin/events/${eventId}/analysis/review?edit=${item.id}`} style={{ textDecoration: 'none' }}>
                <SemanticButton action="photo-analysis:edit" type="button" size="xs" variant="secondary">Update analysis</SemanticButton>
              </Link>,
            ]}
          />
        );
      })}
    </div>
  );
}
