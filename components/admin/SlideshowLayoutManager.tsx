'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EmptyState, LabelTag, SemanticButton } from '@doneisbetter/gds-core/client';

export interface SlideshowLayoutListItem {
  _id: string;
  layoutId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  eventMongoId: string;
  initialLayouts: SlideshowLayoutListItem[];
}

export default function SlideshowLayoutManager({
  eventMongoId,
  initialLayouts,
}: Props) {
  const [layouts, setLayouts] = useState(initialLayouts);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const name = prompt('Layout name (e.g. Main videowall):');
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/slideshow-layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: eventMongoId, name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to create layout');
        return;
      }
      const data = await res.json();
      setLayouts([
        {
          _id: data.layout._id,
          layoutId: data.layout.layoutId,
          name: data.layout.name,
          isActive: data.layout.isActive,
          createdAt: data.layout.createdAt,
        },
        ...layouts,
      ]);
    } catch {
      alert('Failed to create layout');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (mongoId: string) => {
    if (!confirm('Delete this slideshow layout?')) return;
    try {
      const res = await fetch(`/api/slideshow-layouts?id=${mongoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLayouts(layouts.filter((l) => l._id !== mongoId));
      } else {
        alert('Failed to delete');
      }
    } catch {
      alert('Failed to delete');
    }
  };

  const copyUrl = (layoutId: string) => {
    const url = `${window.location.origin}/slideshow-layout/${layoutId}`;
    navigator.clipboard.writeText(url);
    alert('Layout URL copied to clipboard');
  };

  return (
    <section style={{ background: 'var(--gds-color-surface)', border: '1px solid var(--gds-color-border)', borderRadius: '1rem', padding: '1.5rem' }}>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div style={{ alignItems: 'flex-start', display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>Event Slideshow Layouts</h2>
            <p style={{ color: 'var(--gds-color-muted)', margin: '0.25rem 0 0' }}>
              Combine multiple slideshows on one screen.
            </p>
          </div>
          <SemanticButton
            action="slideshow-layouts:create"
            type="button"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'New layout'}
          </SemanticButton>
        </div>

      {layouts.length === 0 ? (
          <EmptyState
            title="No layouts yet"
            description="Create a layout to assign slideshows to regions on a shared display."
          />
      ) : (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
            {layouts.map((layout) => (
              <article
                key={layout._id}
                style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}
              >
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <div style={{ alignItems: 'flex-start', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                    <div style={{ display: 'grid', gap: '0.25rem' }}>
                      <strong>
                      {layout.name}
                      </strong>
                      <LabelTag tone={layout.isActive ? 'success' : 'neutral'} label={layout.isActive ? 'Active' : 'Inactive'} />
                    </div>
                    <SemanticButton
                    action="slideshow-layouts:delete"
                    type="button"
                    onClick={() => handleDelete(layout._id)}
                      variant="danger"
                      size="xs"
                    title="Delete"
                  >
                    Delete
                    </SemanticButton>
                  </div>
                  <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.75rem', margin: 0 }}>
                    Created {new Date(layout.createdAt).toLocaleDateString()}
                  </p>
                  <Link href={`/admin/events/${eventMongoId}/layouts/${layout._id}`} style={{ textDecoration: 'none' }}>
                    <SemanticButton action="slideshow-layouts:edit" fullWidth>Edit layout</SemanticButton>
                  </Link>
                  <Link href={`/slideshow-layout/${layout.layoutId}`} target="_blank" style={{ textDecoration: 'none' }}>
                    <SemanticButton action="slideshow-layouts:open" fullWidth variant="secondary">Open layout</SemanticButton>
                  </Link>
                  <SemanticButton
                    action="slideshow-layouts:copy-url"
                    type="button"
                    onClick={() => copyUrl(layout.layoutId)}
                    fullWidth
                    variant="secondary"
                  >
                    Copy public URL
                  </SemanticButton>
                </div>
              </article>
            ))}
          </div>
      )}
      </div>
    </section>
  );
}
