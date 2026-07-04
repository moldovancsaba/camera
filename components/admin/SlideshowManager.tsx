'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
/**
 * Slideshow Manager Component
 *
 * Client component for managing event slideshows from admin event detail page.
 */

import { useState } from 'react';
import Link from 'next/link';
import { IconCopy, IconExternalLink, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { EmptyState, LabelTag } from '@sovereignsquad/gds-core/client';

interface Slideshow {
  _id: string;
  slideshowId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  bufferSize?: number;
  transitionDurationMs?: number;
  fadeDurationMs?: number;
  refreshStrategy?: 'continuous' | 'batch';
  playMode?: 'once' | 'loop';
  orderMode?: 'fixed' | 'random';
  backgroundPrimaryColor?: string;
  backgroundAccentColor?: string;
  backgroundImageUrl?: string | null;
  viewportScale?: 'fit' | 'fill';
  stageAspect?: number | null;
}

interface Props {
  eventId: string;
  initialSlideshows: Slideshow[];
}

export default function SlideshowManager({ eventId, initialSlideshows }: Props) {
  const [slideshows, setSlideshows] = useState<Slideshow[]>(initialSlideshows);

  const handleDeleteSlideshow = async (slideshowId: string) => {
    if (!confirm('Delete this slideshow?')) return;

    try {
      const response = await fetch(`/api/slideshows?id=${slideshowId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSlideshows(slideshows.filter((slideshow) => slideshow._id !== slideshowId));
      } else {
        alert('Failed to delete slideshow');
      }
    } catch {
      alert('Failed to delete slideshow');
    }
  };

  const copySlideshowUrl = (slideshowId: string) => {
    const url = `${window.location.origin}/slideshow/${slideshowId}`;
    navigator.clipboard.writeText(url);
    alert('Slideshow URL copied to clipboard!');
  };

  return (
    <section style={{ background: 'var(--gds-color-surface)', border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--gds-color-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Event Slideshows</h2>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.5rem 0 0' }}>
            Display submissions on screens during the event
          </p>
        </div>
        <Link href={`/admin/events/${eventId}/slideshows/new`} style={{ textDecoration: 'none' }}>
          <SemanticButton action="slideshows:create" leftSection={<IconPlus size={16} />}>
            New Slideshow
          </SemanticButton>
        </Link>
      </div>

      {slideshows.length === 0 ? (
        <div style={{ padding: '1.5rem' }}>
          <EmptyState
            title="No slideshows yet"
            description="Create a slideshow to display event photos on screens with smart playlist rotation."
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', padding: '1.5rem' }}>
          {slideshows.map((slideshow) => (
            <article key={slideshow._id} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', display: 'grid', gap: '1rem', padding: '1rem' }}>
              <div style={{ alignItems: 'flex-start', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                <div>
                  <strong>{slideshow.name}</strong>
                  <div style={{ marginTop: '0.25rem' }}>
                    <LabelTag tone={slideshow.isActive ? 'success' : 'neutral'} label={slideshow.isActive ? 'Active' : 'Inactive'} />
                  </div>
                </div>
                <SemanticButton
                  action="slideshows:delete"
                  variant="danger"
                  size="xs"
                  onClick={() => void handleDeleteSlideshow(slideshow._id)}
                  aria-label="Delete"
                >
                  <IconTrash size={16} />
                </SemanticButton>
              </div>

              <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0 }}>
                Created {new Date(slideshow.createdAt).toLocaleDateString()}
              </p>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <Link href={`/admin/events/${eventId}/slideshows/${slideshow._id}`} style={{ textDecoration: 'none' }}>
                  <SemanticButton action="slideshows:edit" fullWidth leftSection={<IconPencil size={16} />}>
                    Edit slideshow
                  </SemanticButton>
                </Link>
                <Link href={`/slideshow/${slideshow.slideshowId}`} target="_blank" style={{ textDecoration: 'none' }}>
                  <SemanticButton action="slideshows:open" fullWidth variant="secondary" leftSection={<IconExternalLink size={16} />}>
                    Open Slideshow
                  </SemanticButton>
                </Link>
                <SemanticButton
                  action="slideshows:copy-url"
                  fullWidth
                  variant="secondary"
                  size="xs"
                  leftSection={<IconCopy size={14} />}
                  onClick={() => copySlideshowUrl(slideshow.slideshowId)}
                >
                  Copy public URL
                </SemanticButton>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
