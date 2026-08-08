'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
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
  return error instanceof Error ? error.message : 'Failed to upload garment';
}

export default function NewTryOnSuitPage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leatherSuitId, setLeatherSuitId] = useState('');
  const [assetVersion, setAssetVersion] = useState('1');
  const [isActive, setIsActive] = useState(true);

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

    const formData = new FormData();
    formData.set('name', name);
    formData.set('description', description);
    formData.set('leatherSuitId', leatherSuitId);
    formData.set('assetVersion', assetVersion);
    formData.set('isActive', isActive ? 'true' : 'false');
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
        <AdminCrudForm title="Garment details" description="Upload an image and set the garment's metadata.">
          <FormSection title="Garment preview">
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

          <AdminFormSection title="Garment details">
            <AdminTextInput name="name" label="Title" value={name} onChange={setName} required placeholder="e.g., Honda Castrol 2026" />
            <AdminTextarea name="description" label="Description" value={description} onChange={setDescription} placeholder="Optional operator notes..." />
            <AdminTextInput
              name="leatherSuitId"
              label="Catalog ID"
              value={leatherSuitId}
              onChange={setLeatherSuitId}
              placeholder="Optional. Leave empty to auto-generate from title."
            />
            <AdminTextInput
              name="assetVersion"
              label="Asset version"
              value={assetVersion}
              onChange={setAssetVersion}
              inputMode="numeric"
              placeholder="1"
            />
            <AdminCheckbox
              name="isActive"
              label="Active (available for event assignment)"
              checked={isActive}
              onChange={setIsActive}
            />
          </AdminFormSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="garments:create" type="submit" loading={isUploading} disabled={!preview}>
              {isUploading ? 'Uploading…' : 'Create Garment'}
            </SemanticButton>
            <SemanticButton action="garments:cancel-create" variant="secondary" onClick={() => router.push('/admin/tryon/suits')}>
              Cancel
            </SemanticButton>
          </div>
        </AdminCrudForm>
      </form>
    </EditorScaffold>
  );
}
