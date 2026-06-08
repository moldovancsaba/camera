/**
 * Edit Frame Page
 */

'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import {
  AdminCheckbox,
  AdminCrudForm,
  AdminFormSection,
  AdminSelect,
  AdminTextInput,
  AdminTextarea,
  FormSection,
} from '@doneisbetter/gds-admin/client';
import { InlineAlert, StateBlock, useGdsConfirm, useGdsToasts } from '@doneisbetter/gds-core/client';

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

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'corporate', label: 'Corporate' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Frame request failed';
}

export default function EditFramePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [frame, setFrame] = useState<FrameRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDestructive } = useGdsConfirm();
  const { notifyError } = useGdsToasts();

  useEffect(() => {
    async function fetchFrame() {
      try {
        const response = await fetch(`/api/frames/${id}`);
        if (!response.ok) throw new Error('Frame not found');
        const data = await response.json();
        const nextFrame = data.frame as FrameRecord;
        setFrame(nextFrame);
        setName(nextFrame.name);
        setDescription(nextFrame.description ?? '');
        setCategory(nextFrame.category || 'general');
        setIsActive(Boolean(nextFrame.isActive));
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }

    void fetchFrame();
  }, [id]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/frames/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          category,
          isActive,
        }),
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
      notifyError({ title: 'Delete failed', message });
      setIsDeleting(false);
    }
  };

  const confirmDelete = async () => {
    if (!frame) return;
    const confirmed = await confirmDestructive({
      title: 'Delete frame',
      message: 'Are you sure you want to delete this frame? This cannot be undone.',
      targetName: frame.name,
    });
    if (confirmed) {
      await handleDelete();
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
    <EditorScaffold
      eyebrow="Camera Core"
      title="Edit Frame"
      description="Update frame details and settings."
      breadcrumbs={
        <nav aria-label="Breadcrumb">
          <Link href="/admin/frames">Frames</Link>
          <span aria-hidden> / </span>
          <span>Edit</span>
        </nav>
      }
      maxWidth={960}
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}

      <form onSubmit={handleSubmit}>
        <AdminCrudForm title="Frame settings" description="Update metadata for this frame resource.">
          <FormSection title="Frame preview" description="To change the image, delete this frame and upload a new one.">
            <div style={{ aspectRatio: '1 / 1', borderRadius: 12, maxWidth: 320, overflow: 'hidden', position: 'relative' }}>
              <Image src={frame.thumbnailUrl || frame.imageUrl} alt={frame.name} fill style={{ objectFit: 'contain', padding: 24 }} unoptimized />
            </div>
          </FormSection>

          <AdminFormSection title="Frame details">
            <AdminTextInput name="name" label="Frame name" value={name} onChange={setName} required />
            <AdminTextarea name="description" label="Description" value={description} onChange={setDescription} />
            <AdminSelect
              name="category"
              label="Category"
              value={category}
              onChange={(value) => setCategory(value ?? 'general')}
              data={CATEGORY_OPTIONS}
            />
            <AdminCheckbox
              name="isActive"
              label="Make frame active (visible to users)"
              checked={isActive}
              onChange={setIsActive}
            />
          </AdminFormSection>

          <AdminFormSection title="Technical information">
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <div><span>Frame ID</span><code style={{ display: 'block' }}>{frame.frameId || 'Not assigned'}</code></div>
              <div><span>MongoDB ID</span><code style={{ display: 'block' }}>{frame._id}</code></div>
              <div>Dimensions: {frame.width || 'N/A'} × {frame.height || 'N/A'} px</div>
              <div>File size: {frame.fileSize ? `${(frame.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</div>
            </div>
            <a href={frame.imageUrl} target="_blank" rel="noopener noreferrer">
              Open image URL
            </a>
          </AdminFormSection>

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
              onClick={() => void confirmDelete()}
            >
              Delete frame
            </SemanticButton>
          </div>
        </AdminCrudForm>
      </form>
    </EditorScaffold>
  );
}
