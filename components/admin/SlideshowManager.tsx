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
  /** The slideshow the welcome page screen and the giant screen start from (camera#327). */
  isDefault?: boolean;
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
  /** The picture of the welcome page screen drawn from the default slideshow, when the event has one. */
  welcomeScreen?: { url: string; generatedAt: string } | null;
}

export default function SlideshowManager({ eventId, initialSlideshows, welcomeScreen = null }: Props) {
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

  const [busy, setBusy] = useState(false);
  const hasDefault = slideshows.some((slideshow) => slideshow.isDefault);

  // One call to the default-slideshow route, then a reload so the list shows what the server holds (a new one has its picture and link).
  const callDefault = async (method: 'POST' | 'PUT', body?: object) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/events/${eventId}/default-slideshow`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error || `Request failed (${response.status})`);
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'The default slideshow could not be changed');
      setBusy(false);
    }
  };

  const drawWelcomeScreen = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/events/${eventId}/welcome-screen`, { method: 'POST' });
      if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { error?: string } | null)?.error || `Request failed (${response.status})`);
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'The welcome page screen could not be drawn');
      setBusy(false);
    }
  };

  const copySlideshowUrl = (slideshowId: string) => {
    const url = `${window.location.origin}/slideshow/${slideshowId}`;
    navigator.clipboard.writeText(url);
    alert('Slideshow URL copied to clipboard!');
  };

  return (
    <section id="slideshows" style={{ background: 'var(--mantine-color-body)', border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Event Slideshows</h2>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.5rem 0 0' }}>
            Display submissions on screens during the event
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {hasDefault ? null : (
            <SemanticButton action="slideshows:create-default" variant="secondary" loading={busy} disabled={busy} onClick={() => void callDefault('POST')}>
              Create the default slideshow
            </SemanticButton>
          )}
          <Link href={`/admin/events/${eventId}/slideshows/new`} style={{ textDecoration: 'none' }}>
            <SemanticButton action="slideshows:create" leftSection={<IconPlus size={16} />}>
              New Slideshow
            </SemanticButton>
          </Link>
        </div>
      </div>

      <div style={{ alignItems: 'center', borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem' }}>
        {welcomeScreen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={welcomeScreen.url} alt="The welcome page screen drawn from the default slideshow" width={192} height={108} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.5rem', height: 'auto', width: '12rem' }} />
        ) : null}
        <div style={{ flex: '1 1 16rem' }}>
          <strong>Welcome page screen</strong>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.25rem 0 0.75rem' }}>
            {welcomeScreen
              ? `Drawn from the default slideshow on ${new Date(welcomeScreen.generatedAt).toLocaleDateString()}. It is drawn again when the default slideshow changes.`
              : 'The picture of the giant screen the welcome page shows, drawn from the default slideshow. Not drawn yet.'}
          </p>
          <SemanticButton action="slideshows:draw-welcome-screen" variant="secondary" size="xs" loading={busy} disabled={busy} onClick={() => void drawWelcomeScreen()}>
            {welcomeScreen ? 'Draw it again' : 'Draw the welcome page screen'}
          </SemanticButton>
        </div>
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
            <article key={slideshow._id} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', display: 'grid', gap: '1rem', padding: '1rem' }}>
              <div style={{ alignItems: 'flex-start', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                <div>
                  <strong>{slideshow.name}</strong>
                  <div style={{ marginTop: '0.25rem' }}>
                    <LabelTag tone={slideshow.isActive ? 'success' : 'neutral'} label={slideshow.isActive ? 'Active' : 'Inactive'} />
                    {slideshow.isDefault ? <LabelTag tone="info" label="Default" /> : null}
                  </div>
                </div>
                <SemanticButton
                  action="slideshows:delete"
                  variant="danger"
                  size="xs"
                  disabled={slideshow.isDefault}
                  title={slideshow.isDefault ? 'Make another slideshow the default first' : undefined}
                  onClick={() => void handleDeleteSlideshow(slideshow._id)}
                  aria-label="Delete"
                >
                  <IconTrash size={16} />
                </SemanticButton>
              </div>

              <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
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
                {slideshow.isDefault ? null : (
                  <SemanticButton action="slideshows:make-default" fullWidth variant="secondary" size="xs" disabled={busy} onClick={() => void callDefault('PUT', { slideshowId: slideshow.slideshowId })}>
                    Make default
                  </SemanticButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
