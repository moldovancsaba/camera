'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconTrash } from '@tabler/icons-react';
import { InlineAlert, UploadDropzone } from '@sovereignsquad/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import MediaCard from '@/components/media/MediaPreviewCard';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to upload garment';
}

export default function NewTryOnSuitPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (selectedFile: File | null) => {
    if (!selectedFile) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Only PNG, JPG, and WebP files are allowed');
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
      const response = await fetch('/api/admin/tryon-suits', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload garment');
      }

      router.push('/admin/tryon/suits');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsUploading(false);
    }
  };

  return (
    <EditorScaffold
      eyebrow="Apps"
      title="Upload Garment"
      description="Upload a try-on garment asset that Camera will host and the local try-on worker will download."
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <FormSection title="Garment image *">
            {preview ? (
              <MediaCard
                src={preview}
                alt="Garment preview"
                caption={file?.name}
                action={
                  <SemanticButton action="garments:remove-upload" variant="secondary" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                    Remove
                  </SemanticButton>
                }
              />
            ) : (
              <UploadDropzone
                accept="image/png,image/jpeg,image/jpg,image/webp"
                title="Click to upload or drag and drop"
                description="PNG, JPG, or WebP (MAX. 32MB)"
                onFilesSelected={(files) => handleFileChange(files[0] ?? null)}
                actionLabel="Choose garment"
              />
            )}
            {error ? (
              <InlineAlert title="Garment upload failed" message={error} severity="error" />
            ) : null}
          </FormSection>

          <FormSection title="Garment details">
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Title *
              <input name="name" required placeholder="e.g., Honda Castrol 2026" style={{ minHeight: 44, padding: '0 0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Description
              <textarea name="description" rows={3} placeholder="Optional operator notes..." style={{ padding: '0.75rem' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Catalog ID
              <input
              name="leatherSuitId"
              placeholder="Optional. Leave empty to auto-generate from title."
            />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 700 }}>
              Asset version
              <input
              name="assetVersion"
              defaultValue="1"
              inputMode="numeric"
              placeholder="1"
              style={{ minHeight: 44, padding: '0 0.75rem' }}
            />
            </label>
            <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}>
              <input type="checkbox" name="isActive" defaultChecked value="true" />
              Active (available for event assignment)
            </label>
          </FormSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="garments:create" type="submit" loading={isUploading} disabled={!preview}>
              {isUploading ? 'Uploading…' : 'Create Garment'}
            </SemanticButton>
            <SemanticButton action="garments:cancel-create" variant="secondary" onClick={() => router.push('/admin/tryon/suits')}>
              Cancel
            </SemanticButton>
          </div>
        </div>
      </form>
    </EditorScaffold>
  );
}
