'use client';

/**
 * Add New Logo Page
 *
 * Upload and configure new logos for event scenarios.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Checkbox,
  Stack,
  TextInput,
  Textarea,
} from '@/components/gds/ui';
import { IconAlertCircle, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import EditorScaffold from '@/components/gds/EditorScaffold';
import FormSection from '@/components/gds/FormSection';
import UploadDropzone from '@/components/gds/UploadDropzone';
import MediaCard from '@/components/gds/MediaCard';

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
        <Stack gap="lg">
          <FormSection title="Logo Image *">
            {preview ? (
              <MediaCard
                src={preview}
                alt="Logo preview"
                caption={file?.name}
                action={
                  <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                    Remove
                  </Button>
                }
              />
            ) : (
              <UploadDropzone
                accept={['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']}
                icon={<IconPhotoPlus size={40} color="var(--mantine-color-gray-6)" />}
                title="Click to upload or drag and drop"
                description="PNG, JPG, SVG, or WebP (MAX. 32MB)"
                onFile={handleFileChange}
              />
            )}

            {error ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            ) : null}
          </FormSection>

          <FormSection title="Logo Details">
            <TextInput name="name" label="Logo Name *" required placeholder="e.g., AC Milan Logo 2025" />
            <Textarea name="description" label="Description" rows={3} placeholder="Optional description..." />
            <Checkbox name="isActive" defaultChecked value="true" label="Active (available for assignment to events)" />
          </FormSection>

          <Stack gap="sm">
            <Button variant="default" onClick={() => router.push('/admin/logos')}>
              Cancel
            </Button>
            <Button type="submit" loading={isUploading}>
              {isUploading ? 'Uploading…' : 'Upload Logo'}
            </Button>
          </Stack>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
