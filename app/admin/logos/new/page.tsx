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
} from '@mantine/core';
import { IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { UploadDropzone } from '@doneisbetter/gds-core/client';
import EditorScaffold from '@/components/gds/EditorScaffold';
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
        <Stack gap="lg">
          <FormSection title="Logo Image *">
            {preview ? (
              <MediaCard
                src={preview}
                alt="Logo preview"
                caption={file?.name}
                action={
                  <Button variant="light" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                    Remove
                  </Button>
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
              <Alert icon={<IconAlertCircle size={16} />}>
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
