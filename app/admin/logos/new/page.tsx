'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
/**
 * Add New Logo Page
 *
 * Upload and configure new logos for event scenarios.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconTrash } from '@tabler/icons-react';
import { InlineAlert, UploadDropzone } from '@sovereignsquad/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import {
  AdminCheckbox,
  AdminCrudForm,
  AdminFormSection,
  AdminTextInput,
  AdminTextarea,
  FormSection,
} from '@sovereignsquad/gds-admin/client';
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

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

    const formData = new FormData();
    formData.set('name', name);
    formData.set('description', description);
    formData.set('isActive', isActive ? 'true' : 'false');
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
        <AdminCrudForm title="Logo details" description="Upload an image and set the logo's metadata.">
          <FormSection title="Logo preview">
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

          <AdminFormSection title="Logo details">
            <AdminTextInput name="name" label="Logo name" value={name} onChange={setName} required placeholder="e.g., AC Milan Logo 2025" />
            <AdminTextarea name="description" label="Description" value={description} onChange={setDescription} placeholder="Optional description..." />
            <AdminCheckbox
              name="isActive"
              label="Active (available for assignment to events)"
              checked={isActive}
              onChange={setIsActive}
            />
          </AdminFormSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="logos:cancel-create" variant="secondary" onClick={() => router.push('/admin/logos')}>
              Cancel
            </SemanticButton>
            <SemanticButton action="logos:create" type="submit" loading={isUploading}>
              {isUploading ? 'Uploading…' : 'Upload Logo'}
            </SemanticButton>
          </div>
        </AdminCrudForm>
      </form>
    </EditorScaffold>
  );
}
