'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { canonicalPublicOrigin } from '@/lib/site-hosts';
import Link from 'next/link';
import { IconCopy, IconExternalLink, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { EmptyState, InlineAlert, useGdsConfirm } from '@sovereignsquad/gds-core/client';
import { notifyAdminError, notifyAdminSuccess } from '@/components/admin/notify';
import VisibilityStatusIcon from '@/components/gds/VisibilityStatusIcon';

export interface LandingPageListItem {
  _id: string;
  slug: string;
  title?: string | null;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  isDefault?: boolean;
  inheritedFromPartnerId?: string;
  createdAt: string;
}

interface Props {
  eventMongoId: string;
  initialLandingPages: LandingPageListItem[];
  partnerDefaultAvailable?: boolean;
}

export default function LandingPageManager({
  eventMongoId,
  initialLandingPages,
  partnerDefaultAvailable = false,
}: Props) {
  const router = useRouter();
  const [landingPages, setLandingPages] = useState(initialLandingPages);
  const [error, setError] = useState<string | null>(null);
  const { confirmDestructive } = useGdsConfirm();

  const handleDelete = async (mongoId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/landing-pages/${mongoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete landing page');
      }
      setLandingPages((prev) => prev.filter((page) => page._id !== mongoId));
      notifyAdminSuccess({ title: 'Landing page deleted', message: 'Experience page removed.' });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete landing page';
      setError(message);
      notifyAdminError({ title: 'Delete failed', message });
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
    const url = `${canonicalPublicOrigin(window.location.origin, 'camera.messmass.com')}/landing/${slug}`;
    void navigator.clipboard.writeText(url);
    notifyAdminSuccess({ title: 'URL copied', message: 'Landing page URL copied to clipboard.' });
  };

  const updateDefault = async (method: 'PUT' | 'POST', body?: object) => {
    setError(null);
    try {
      const response = await fetch(`/api/admin/events/${eventMongoId}/default-landing-page`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || 'Could not update the event landing page.');
      notifyAdminSuccess({ title: method === 'POST' ? 'Partner default applied' : 'Event default updated', message: 'The event-specific public landing URL is ready.' });
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not update the event landing page.';
      setError(message);
      notifyAdminError({ title: 'Landing page update failed', message });
    }
  };

  return (
    <section id="landing-pages" style={{ background: 'var(--mantine-color-body)', border: '1px solid var(--mantine-color-default-border)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ alignItems: 'flex-start', borderBottom: '1px solid var(--mantine-color-default-border)', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', padding: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>Experience Landing Pages</h2>
          <p style={{ color: 'var(--mantine-color-dimmed)', margin: '0.5rem 0 0' }}>
            Public experience surfaces for this event. They can embed a slideshow or layout and route visitors into
            app actions like capture.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {partnerDefaultAvailable ? <SemanticButton action="landing-pages:inherit-partner-default" variant="secondary" onClick={() => void updateDefault('POST')}>Use partner default</SemanticButton> : null}
          <Link href={`/landing/event/${eventMongoId}`} target="_blank" style={{ textDecoration: 'none' }}>
            <SemanticButton action="landing-pages:open-event-url" variant="secondary" leftSection={<IconExternalLink size={16} />}>Open event landing URL</SemanticButton>
          </Link>
          <SemanticButton action="landing-pages:copy-event-url" variant="secondary" leftSection={<IconCopy size={14} />} onClick={() => {
            const url = `${canonicalPublicOrigin(window.location.origin, 'camera.messmass.com')}/landing/event/${eventMongoId}`;
            void navigator.clipboard.writeText(url);
            notifyAdminSuccess({ title: 'URL copied', message: 'Event landing URL copied to clipboard.' });
          }}>Copy event URL</SemanticButton>
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
            <article key={page._id} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.875rem', display: 'grid', gap: '1rem', padding: '1rem' }}>
              <div style={{ alignItems: 'flex-start', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {page.title?.trim() || page.slug}
                  </strong>
                  <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: '0.25rem 0 0', wordBreak: 'break-all' }}>
                    /landing/{page.slug}
                  </p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <VisibilityStatusIcon isVisible={page.isActive} />
                    {page.isDefault ? <span style={{ marginLeft: '0.5rem' }}>Event default</span> : null}
                    {page.inheritedFromPartnerId ? <span style={{ marginLeft: '0.5rem' }}>Inherited from partner</span> : null}
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
                <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
                  Embedded experience: {page.targetType === 'layout' ? 'Layout' : 'Slideshow'} · {page.targetName}
                </p>
                <p style={{ color: 'var(--mantine-color-dimmed)', fontSize: '0.75rem', margin: 0 }}>
                  Created {new Date(page.createdAt).toLocaleDateString()}
                </p>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <Link href={`/admin/events/${eventMongoId}/landing-pages/${page._id}`} style={{ textDecoration: 'none' }}>
                  <SemanticButton action="landing-pages:edit" fullWidth leftSection={<IconPencil size={16} />}>
                    Edit experience page
                  </SemanticButton>
                </Link>
                <Link href={page.isDefault ? `/landing/event/${eventMongoId}` : `/landing/${page.slug}`} target="_blank" style={{ textDecoration: 'none' }}>
                  <SemanticButton action="landing-pages:open" fullWidth variant="secondary" leftSection={<IconExternalLink size={16} />}>
                    Open landing page
                  </SemanticButton>
                </Link>
                {page.isDefault ? null : <SemanticButton action="landing-pages:set-default" fullWidth variant="secondary" size="xs" onClick={() => void updateDefault('PUT', { landingPageId: page._id })}>Make event default</SemanticButton>}
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
