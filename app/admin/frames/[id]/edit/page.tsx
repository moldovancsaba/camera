/**
 * Edit Frame Page
 */

'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { notifications } from '@/lib/gds/notifications';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { FormSection } from '@doneisbetter/gds-admin/client';
import { InlineAlert, StateBlock } from '@doneisbetter/gds-core/client';
import { confirmDestructive } from '@/lib/gds/confirm-destructive';

interface FrameRecord {
  _id: string;
  frameId?: string;
  name: string;
  description?: string;
  category?: string;
  isActive?: boolean;
  thumbnailUrl?: string;
  imageUrl: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Frame request failed';
}

export default function EditFramePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [frame, setFrame] = useState<FrameRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFrame() {
      try {
        const response = await fetch(`/api/frames/${id}`);
        if (!response.ok) throw new Error('Frame not found');
        const data = await response.json();
        setFrame(data.frame);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }

    void fetchFrame();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const updateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      category: formData.get('category'),
      isActive: formData.get('isActive') === 'on',
    };

    try {
      const response = await fetch(`/api/frames/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update frame');
      }

      router.push('/admin/frames');
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
      const response = await fetch(`/api/frames/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete frame');
      }

      router.push('/admin/frames');
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifications.show({ title: 'Delete failed', message, color: 'red' });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading frame…" />;
  }

  if (!frame) {
    return (
      <StateBlock
        variant="error"
        title="Frame not found"
        description={error || undefined}
        action={
          <Link href="/admin/frames" style={{ textDecoration: 'none' }}>
          <SemanticButton action="frames:back-to-list" variant="secondary">
            Back to frames
          </SemanticButton>
          </Link>
        }
      />
    );
  }

  return (
    <div style={{ display: 'grid', gap: '2rem', margin: '0 auto', maxWidth: 960 }}>
      <nav aria-label="Breadcrumb">
        <Link href="/admin/frames">
          Frames
        </Link>
        <span aria-hidden> / </span>
        <span>Edit</span>
      </nav>

      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Edit Frame"
        description="Update frame details and settings."
      />

      {error ? (
        <InlineAlert title="Error" message={error} severity="error" />
      ) : null}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Frame preview" description="To change the image, delete this frame and upload a new one.">
            <div style={{ aspectRatio: '1 / 1', borderRadius: 12, maxWidth: 320, overflow: 'hidden', position: 'relative' }}>
                <Image src={frame.thumbnailUrl || frame.imageUrl} alt={frame.name} fill style={{ objectFit: 'contain', padding: 24 }} unoptimized />
            </div>
          </FormSection>

          <FormSection title="Frame details">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Frame name
              <input name="name" required defaultValue={frame.name} style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea name="description" rows={3} defaultValue={frame.description} style={{ padding: '0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Category
              <select
              name="category"
              defaultValue={frame.category || 'general'}
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            >
                <option value="general">General</option>
                <option value="holiday">Holiday</option>
                <option value="birthday">Birthday</option>
                <option value="wedding">Wedding</option>
                <option value="corporate">Corporate</option>
              </select>
            </label>
            <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
              <input type="checkbox" name="isActive" defaultChecked={frame.isActive} />
              Make frame active (visible to users)
            </label>
          </FormSection>

          <FormSection title="Technical information">
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <div><span>Frame ID</span><code style={{ display: 'block' }}>{frame.frameId || 'Not assigned'}</code></div>
              <div><span>MongoDB ID</span><code style={{ display: 'block' }}>{frame._id}</code></div>
              <div>Dimensions: {frame.width || 'N/A'} × {frame.height || 'N/A'} px</div>
              <div>File size: {frame.fileSize ? `${(frame.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</div>
            </div>
            <a href={frame.imageUrl} target="_blank" rel="noopener noreferrer">
              Open image URL
            </a>
          </FormSection>

          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <SemanticButton action="frames:save" type="submit" loading={isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </SemanticButton>
              <Link href="/admin/frames" style={{ textDecoration: 'none' }}>
              <SemanticButton action="frames:cancel-edit" variant="secondary">
                Cancel
              </SemanticButton>
              </Link>
            </div>
            <SemanticButton
              action="frames:delete"
              type="button"
              variant="danger"
              loading={isDeleting}
              disabled={isDeleting}
              onClick={() =>
                confirmDestructive({
                  title: 'Delete frame',
                  message: 'Are you sure you want to delete this frame? This cannot be undone.',
                  targetName: frame.name,
                  onConfirm: () => void handleDelete(),
                })
              }
            >
              Delete frame
            </SemanticButton>
          </div>
        </div>
      </form>
    </div>
  );
}
