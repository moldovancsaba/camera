/**
 * Edit Logo Page
 *
 * Full CRUD — update logo details and toggle active status.
 * Uses the official GDS admin form primitives (AdminCrudForm / AdminFormSection /
 * AdminTextInput / AdminTextarea / AdminCheckbox) at parity with the frames editor.
 */

'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import {
  AdminCheckbox,
  AdminCrudForm,
  AdminFormSection,
  AdminTextInput,
  AdminTextarea,
  FormSection,
} from '@sovereignsquad/gds-admin/client';
import { InlineAlert, StateBlock, useGdsConfirm, useGdsToasts } from '@sovereignsquad/gds-core/client';

interface LogoRecord {
  _id: string;
  logoId?: string;
  name: string;
  description?: string;
  isActive?: boolean;
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  usageCount?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Logo request failed';
}

export default function EditLogoPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [logo, setLogo] = useState<LogoRecord | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmDestructive } = useGdsConfirm();
  const { notifyError } = useGdsToasts();

  useEffect(() => {
    async function fetchLogo() {
      try {
        const response = await fetch(`/api/logos/${id}`);
        if (!response.ok) throw new Error('Logo not found');
        const data = await response.json();
        // Handle wrapped response
        const logoData = (data.logo || data.data?.logo || data) as LogoRecord;
        setLogo(logoData);
        setName(logoData.name);
        setDescription(logoData.description ?? '');
        setIsActive(Boolean(logoData.isActive));
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }

    void fetchLogo();
  }, [id]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/logos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          isActive,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update logo');
      }

      router.push('/admin/logos');
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
      const response = await fetch(`/api/logos/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete logo');
      }

      router.push('/admin/logos');
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifyError({ title: 'Delete failed', message });
      setIsDeleting(false);
    }
  };

  const confirmDelete = async () => {
    if (!logo) return;
    const confirmed = await confirmDestructive({
      title: 'Delete logo',
      message: 'Are you sure you want to delete this logo? This cannot be undone.',
      targetName: logo.name,
    });
    if (confirmed) {
      await handleDelete();
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading logo…" />;
  }

  if (!logo) {
    return (
      <StateBlock
        variant="error"
        title="Logo not found"
        description={error || undefined}
        action={
          <Link href="/admin/logos" style={{ textDecoration: 'none' }}>
            <SemanticButton action="logos:back-to-list" variant="secondary">
              Back to logos
            </SemanticButton>
          </Link>
        }
      />
    );
  }

  return (
    <EditorScaffold
      eyebrow="Camera Core"
      title="Edit Logo"
      description="Update logo details and settings."
      breadcrumbs={
        <nav aria-label="Breadcrumb">
          <Link href="/admin/logos">Logos</Link>
          <span aria-hidden> / </span>
          <span>Edit</span>
        </nav>
      }
      maxWidth={960}
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}

      <form onSubmit={handleSubmit}>
        <AdminCrudForm title="Logo settings" description="Update metadata for this logo resource.">
          <FormSection title="Logo preview" description="To change the image, delete this logo and upload a new one.">
            <div style={{ aspectRatio: '1 / 1', borderRadius: 12, maxWidth: 320, overflow: 'hidden', position: 'relative' }}>
              <Image
                src={logo.thumbnailUrl || logo.imageUrl}
                alt={logo.name}
                fill
                style={{ objectFit: 'contain', padding: 24 }}
                unoptimized
              />
            </div>
          </FormSection>

          <AdminFormSection title="Logo details">
            <AdminTextInput name="name" label="Logo name" value={name} onChange={setName} required />
            <AdminTextarea name="description" label="Description" value={description} onChange={setDescription} />
            <AdminCheckbox
              name="isActive"
              label="Make logo active (available for assignment to events)"
              checked={isActive}
              onChange={setIsActive}
            />
          </AdminFormSection>

          <AdminFormSection title="Technical information">
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
              <div><span>Logo ID</span><code style={{ display: 'block' }}>{logo.logoId || 'Not assigned'}</code></div>
              <div><span>MongoDB ID</span><code style={{ display: 'block' }}>{logo._id}</code></div>
              <div>Dimensions: {logo.width || 'N/A'} × {logo.height || 'N/A'} px</div>
              <div>File size: {logo.fileSize ? `${(logo.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</div>
              <div>MIME type: {logo.mimeType || 'N/A'}</div>
              <div>Usage count: {logo.usageCount || 0}</div>
              <div>Created: {logo.createdAt ? new Date(logo.createdAt).toLocaleString() : 'N/A'}</div>
              <div>Updated: {logo.updatedAt ? new Date(logo.updatedAt).toLocaleString() : 'N/A'}</div>
            </div>
            <a href={logo.imageUrl} target="_blank" rel="noopener noreferrer">
              Open image URL
            </a>
            {logo.thumbnailUrl ? (
              <a href={logo.thumbnailUrl} target="_blank" rel="noopener noreferrer">
                Open thumbnail URL
              </a>
            ) : null}
          </AdminFormSection>

          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <SemanticButton action="logos:save" type="submit" loading={isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </SemanticButton>
              <Link href="/admin/logos" style={{ textDecoration: 'none' }}>
                <SemanticButton action="logos:cancel-edit" variant="secondary">
                  Cancel
                </SemanticButton>
              </Link>
            </div>
            <SemanticButton
              action="logos:delete"
              type="button"
              variant="danger"
              loading={isDeleting}
              disabled={isDeleting}
              onClick={() => void confirmDelete()}
            >
              Delete logo
            </SemanticButton>
          </div>
        </AdminCrudForm>
      </form>
    </EditorScaffold>
  );
}
