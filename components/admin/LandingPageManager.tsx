'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useState } from 'react';
import Link from 'next/link';
import { IconCopy, IconExternalLink, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { EmptyState, InlineAlert, LabelTag, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';

export interface LandingPageListItem {
  _id: string;
  slug: string;
  title?: string | null;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  eventMongoId: string;
  initialLandingPages: LandingPageListItem[];
}

export default function LandingPageManager({
  eventMongoId,
  initialLandingPages,
}: Props) {
  const [landingPages, setLandingPages] = useState(initialLandingPages);
  const [error, setError] = useState<string | null>(null);
  const { confirmDestructive } = useGdsConfirm();
  const { notifySuccess, notifyError } = useGdsToasts();

  const handleDelete = async (mongoId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/landing-pages/${mongoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete landing page');
      }
      setLandingPages((prev) => prev.filter((page) => page._id !== mongoId));
      notifySuccess({ title: 'Landing page deleted', message: 'Experience page removed.' });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete landing page';
      setError(message);
      notifyError({ title: 'Delete failed', message });
    }
  };

  const confirmDelete = async (page: LandingPageListItem) => {
    const confirmed = await confirmDestructive({
      title: 'Delete landing page',
      message: 'Are you sure you want to delete this landing page?',
      targetName: page.title?.trim() || page.slug,
    });
    if (confirmed) {
      await handleDelete(page._id);
    }
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/landing/${slug}`;
    void navigator.clipboard.writeText(url);
    notifySuccess({ title: 'URL copied', message: 'Landing page URL copied to clipboard.' });
  };

  return (
    <section style={{ background: 'var(--gds-color-surface)', border: '1px solid var(--gds-color-border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--gds-color-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Experience Landing Pages</h2>
          <p style={{ color: 'var(--gds-color-muted)', margin: '0.5rem 0 0' }}>
            Public experience surfaces for this event. They can embed a slideshow or layout and route visitors into
            app actions like capture.
          </p>
        </div>
        <Link href={`/admin/events/${eventMongoId}/landing-pages/new`} style={{ textDecoration: 'none' }}>
          <SemanticButton action="landing-pages:create" leftSection={<IconPlus size={16} />}>
            New landing page
          </SemanticButton>
        </Link>
      </div>

      {error ? (
        <div style={{ padding: '1.5rem 1.5rem 0' }}>
          <InlineAlert title="Landing page action failed" message={error} severity="error" />
        </div>
      ) : null}

      {landingPages.length === 0 ? (
        <div style={{ padding: '1.5rem' }}>
          <EmptyState
            title="No landing pages yet"
            description="Create an experience page for this event and connect it to one slideshow or one layout."
          />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', padding: '1.5rem' }}>
          {landingPages.map((page) => (
            <article key={page._id} style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', display: 'grid', gap: '1rem', padding: '1rem' }}>
              <div style={{ alignItems: 'flex-start', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {page.title?.trim() || page.slug}
                  </strong>
                  <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: '0.25rem 0 0', wordBreak: 'break-all' }}>
                    /landing/{page.slug}
                  </p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <LabelTag tone={page.isActive ? 'success' : 'neutral'} label={page.isActive ? 'Active' : 'Inactive'} />
                  </div>
                </div>
                <SemanticButton
                  action="landing-pages:delete"
                  variant="danger"
                  size="xs"
                  aria-label="Delete"
                  onClick={() => void confirmDelete(page)}
                >
                  <IconTrash size={16} />
                </SemanticButton>
              </div>

              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0 }}>
                  Embedded experience: {page.targetType === 'layout' ? 'Layout' : 'Slideshow'} · {page.targetName}
                </p>
                <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0 }}>
                  Created {new Date(page.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <Link href={`/admin/events/${eventMongoId}/landing-pages/${page._id}`} style={{ textDecoration: 'none' }}>
                  <SemanticButton action="landing-pages:edit" fullWidth leftSection={<IconPencil size={16} />}>
                    Edit experience page
                  </SemanticButton>
                </Link>
                <Link href={`/landing/${page.slug}`} target="_blank" style={{ textDecoration: 'none' }}>
                  <SemanticButton action="landing-pages:open" fullWidth variant="secondary" leftSection={<IconExternalLink size={16} />}>
                    Open landing page
                  </SemanticButton>
                </Link>
                <SemanticButton action="landing-pages:copy-url" fullWidth variant="secondary" size="xs" leftSection={<IconCopy size={14} />} onClick={() => copyUrl(page.slug)}>
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
