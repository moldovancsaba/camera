'use client';

import SemanticButton from '@/components/gds/CameraSemanticButton';
/**
 * Add New Frame Page
 *
 * Upload and configure new photo frames.
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
  AdminSelect,
  AdminTextInput,
  AdminTextarea,
  FormSection,
} from '@sovereignsquad/gds-admin/client';
import MediaCard from '@/components/media/MediaPreviewCard';

const CATEGORY_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'corporate', label: 'Corporate' },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to upload frame';
}

export default function NewFramePage() {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [isActive, setIsActive] = useState(true);

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

    const formData = new FormData();
    formData.set('name', name);
    formData.set('description', description);
    formData.set('category', category);
    formData.set('isActive', isActive ? 'true' : 'false');
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
        <AdminCrudForm title="Frame details" description="Upload an image and set the frame's metadata.">
          <FormSection title="Frame preview">
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

          <AdminFormSection title="Frame details">
            <AdminTextInput name="name" label="Frame name" value={name} onChange={setName} required placeholder="e.g., Holiday Frame 2024" />
            <AdminTextarea name="description" label="Description" value={description} onChange={setDescription} placeholder="Optional description..." />
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

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SemanticButton action="frames:create" type="submit" loading={isUploading} disabled={!preview}>
              {isUploading ? 'Uploading...' : 'Create Frame'}
            </SemanticButton>
            <SemanticButton action="frames:cancel-create" variant="secondary" onClick={() => router.back()}>
              Cancel
            </SemanticButton>
          </div>
        </AdminCrudForm>
      </form>
    </EditorScaffold>
  );
}
