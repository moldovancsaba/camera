'use client';

/**
 * Add New Logo Page
 *
 * Upload and configure new logos for event scenarios.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconTrash } from '@tabler/icons-react';
import { InlineAlert, SemanticButton, UploadDropzone } from '@doneisbetter/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';
import MediaCard from '@/components/media/MediaPreviewCard';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}

export default function NewLogoPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Only PNG, JPG, SVG, and WebP files are allowed');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
      setFile(selectedFile);
      setError(null);
    };
    reader.readAsDataURL(selectedFile);
  };

  const clearFile = () => {
    setPreview(null);
    setFile(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsUploading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    if (file) {
      formData.set('file', file);
    }

    try {
      const response = await fetch('/api/logos', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to upload logo');
      }

      router.push('/admin/logos');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsUploading(false);
    }
  };

  return (
    <EditorScaffold
      eyebrow="Resource Inventory"
      title="Add New Logo"
      description="Upload a logo for event scenarios"
    >

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Logo Image *">
            {preview ? (
              <MediaCard
                src={preview}
                alt="Logo preview"
                caption={file?.name}
                action={
                  <SemanticButton action="logos:remove-upload" variant="secondary" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                    Remove
                  </SemanticButton>
                }
              />
            ) : (
              <UploadDropzone
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                title="Click to upload or drag and drop"
                description="PNG, JPG, SVG, or WebP (MAX. 32MB)"
                onFilesSelected={(files) => handleFileChange(files[0] ?? null)}
                actionLabel="Choose logo"
              />
            )}

            {error ? (
              <InlineAlert title="Logo upload failed" message={error} severity="error" />
            ) : null}
          </FormSection>

          <FormSection title="Logo Details">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Logo Name *
              <input name="name" required placeholder="e.g., AC Milan Logo 2025" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea name="description" rows={3} placeholder="Optional description..." style={{ padding: '0.75rem' }} />
            </label>
            <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
              <input type="checkbox" name="isActive" defaultChecked value="true" />
              Active (available for assignment to events)
            </label>
          </FormSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="logos:cancel-create" variant="secondary" onClick={() => router.push('/admin/logos')}>
              Cancel
            </SemanticButton>
            <SemanticButton action="logos:create" type="submit" loading={isUploading}>
              {isUploading ? 'Uploading…' : 'Upload Logo'}
            </SemanticButton>
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
