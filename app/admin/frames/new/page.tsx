'use client';

/**
 * Add New Frame Page
 *
 * Upload and configure new photo frames.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconTrash } from '@tabler/icons-react';
import { InlineAlert, SemanticButton, UploadDropzone } from '@doneisbetter/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';
import MediaCard from '@/components/media/MediaPreviewCard';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to upload frame';
}

export default function NewFramePage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    if (!['image/png', 'image/svg+xml'].includes(selectedFile.type)) {
      setError('Only PNG and SVG files are allowed');
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
      const response = await fetch('/api/frames', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload frame');
      }

      router.push('/admin/frames');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsUploading(false);
    }
  };

  return (
    <EditorScaffold
      eyebrow="Resource Inventory"
      title="Add New Frame"
      description="Upload a PNG or SVG frame overlay"
    >

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Frame Image *">
            <input type="hidden" name="file-placeholder" value={file?.name || ''} />
            {preview ? (
              <MediaCard
                src={preview}
                alt="Frame preview"
                caption={file?.name}
                action={
                  <SemanticButton action="frames:remove-upload" variant="secondary" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                    Remove
                  </SemanticButton>
                }
              />
            ) : (
              <UploadDropzone
                accept="image/png,image/svg+xml"
                title="Click to upload or drag and drop"
                description="PNG or SVG (MAX. 32MB)"
                onFilesSelected={(files) => handleFileChange(files[0] ?? null)}
                actionLabel="Choose frame"
              />
            )}
            {error ? (
              <InlineAlert title="Frame upload failed" message={error} severity="error" />
            ) : null}
          </FormSection>

          <FormSection title="Frame Details">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Frame Name *
              <input name="name" required placeholder="e.g., Holiday Frame 2024" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea name="description" rows={3} placeholder="Optional description..." style={{ padding: '0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Category
              <select
              name="category"
              defaultValue="general"
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
              <input type="checkbox" name="isActive" defaultChecked value="true" />
              Make frame active (visible to users)
            </label>
          </FormSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="frames:create" type="submit" loading={isUploading} disabled={!preview}>
              {isUploading ? 'Uploading...' : 'Create Frame'}
            </SemanticButton>
            <SemanticButton action="frames:cancel-create" variant="secondary" onClick={() => router.back()}>
              Cancel
            </SemanticButton>
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
