'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';
import { InlineAlert, StateBlock, useGdsConfirm, useGdsToasts } from '@doneisbetter/gds-core/client';

interface TryOnSuitRecord {
  _id: string;
  leatherSuitId: string;
  name: string;
  description?: string | null;
  assetVersion?: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  sourceImageUrl?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  usageCount?: number;
  isActive?: boolean;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Garment request failed';
}

export default function EditTryOnSuitPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [suit, setSuit] = useState<TryOnSuitRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDestructive } = useGdsConfirm();
  const { notifyError } = useGdsToasts();

  useEffect(() => {
    async function fetchSuit() {
      try {
        const response = await fetch(`/api/admin/tryon-suits/${id}`);
        if (!response.ok) throw new Error('Garment not found');
        const data = await response.json();
        setSuit(data.suit || data.data?.suit || data);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }

    void fetchSuit();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const updateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      assetVersion: formData.get('assetVersion'),
      active: formData.get('active') === 'on',
    };

    try {
      const response = await fetch(`/api/admin/tryon-suits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update garment');
      }

      router.push('/admin/tryon/suits');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/tryon-suits/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete garment');
      }

      router.push('/admin/tryon/suits');
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifyError({ title: 'Delete failed', message });
      setIsDeleting(false);
    }
  };

  const confirmDelete = async () => {
    if (!suit) return;
    const confirmed = await confirmDestructive({
      title: 'Delete garment',
      message: 'Are you sure you want to delete this garment? This cannot be undone.',
      targetName: suit.name,
    });
    if (confirmed) {
      await handleDelete();
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading garment…" />;
  }

  if (!suit) {
    return (
      <StateBlock
        variant="error"
        title="Garment not found"
        description={error || undefined}
        action={
          <Link href="/admin/tryon/suits" style={{ textDecoration: 'none' }}>
          <SemanticButton action="garments:back-to-list" variant="secondary">
            Back to garments
          </SemanticButton>
          </Link>
        }
      />
    );
  }

  const preview = suit.thumbnailUrl || suit.previewUrl || suit.imageUrl || suit.sourceImageUrl || '';

  return (
    <EditorScaffold
      eyebrow="Apps"
      title="Edit Garment"
      description="Update garment details and publishing state."
      breadcrumbs={
        <nav aria-label="Breadcrumb">
          <Link href="/admin/tryon/suits">
            Garments
          </Link>
          <span aria-hidden> / </span>
          <span>Edit</span>
        </nav>
      }
      maxWidth={960}
    >
      {error ? (
        <InlineAlert title="Error" message={error} severity="error" />
      ) : null}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Garment preview" description="To change the image, delete this garment and upload a new one.">
            <div style={{ aspectRatio: '1 / 1', borderRadius: 12, maxWidth: 320, overflow: 'hidden', position: 'relative' }}>
                {preview ? (
                  <Image
                    src={preview}
                    alt={suit.name}
                    fill
                    style={{ objectFit: 'contain', padding: 24 }}
                    unoptimized
                  />
                ) : null}
            </div>
          </FormSection>

          <FormSection title="Technical information">
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <div><span>Catalog ID</span><code style={{ display: 'block' }}>{suit.leatherSuitId}</code></div>
              <div><span>MongoDB ID</span><code style={{ display: 'block' }}>{suit._id}</code></div>
              <div>Asset version: {suit.assetVersion || 1}</div>
              <div>File size: {suit.fileSize ? `${(suit.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</div>
              <div>MIME type: {suit.mimeType || 'N/A'}</div>
              <div>Queue usage: {suit.usageCount || 0}</div>
              <div>Created: {suit.createdAt ? new Date(suit.createdAt).toLocaleString() : 'N/A'}</div>
              <div>Updated: {suit.updatedAt ? new Date(suit.updatedAt).toLocaleString() : 'N/A'}</div>
            </div>
            {suit.imageUrl ? (
              <a href={suit.imageUrl} target="_blank" rel="noopener noreferrer">
                Open asset image URL
              </a>
            ) : null}
            {suit.thumbnailUrl ? (
              <a href={suit.thumbnailUrl} target="_blank" rel="noopener noreferrer">
                Open thumbnail URL
              </a>
            ) : null}
          </FormSection>

          <FormSection title="Garment details">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Title *
              <input name="name" required defaultValue={suit.name} style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea name="description" rows={3} defaultValue={suit.description || ''} style={{ padding: '0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Asset version
              <input
              name="assetVersion"
              defaultValue={String(suit.assetVersion || 1)}
              inputMode="numeric"
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            />
            </label>
            <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
              <input type="checkbox" name="active" defaultChecked={suit.active ?? suit.isActive} />
              Active (available for assignment to events)
            </label>
          </FormSection>

          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <SemanticButton action="garments:save" type="submit" loading={isSaving}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </SemanticButton>
              <Link href="/admin/tryon/suits" style={{ textDecoration: 'none' }}>
              <SemanticButton action="garments:cancel-edit" variant="secondary">
                Cancel
              </SemanticButton>
              </Link>
            </div>
            <SemanticButton
              action="garments:delete"
              variant="danger"
              loading={isDeleting}
              onClick={() => void confirmDelete()}
            >
              Delete Garment
            </SemanticButton>
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
