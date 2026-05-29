'use client';

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
  return error instanceof Error ? error.message : 'Failed to upload leather jersey';
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
        throw new Error(data.error || 'Failed to upload leather jersey');
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
      title="Upload Leather Jersey"
      description="Upload a try-on suit asset that Camera will host and the local try-on worker will download."
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Leather jersey image *">
            {preview ? (
              <MediaCard
                src={preview}
                alt="Leather jersey preview"
                caption={file?.name}
                action={
                  <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                    Remove
                  </Button>
                }
              />
            ) : (
              <UploadDropzone
                accept="image/png,image/jpeg,image/jpg,image/webp"
                title="Click to upload or drag and drop"
                description="PNG, JPG, or WebP (MAX. 32MB)"
                onFilesSelected={(files) => handleFileChange(files[0] ?? null)}
                actionLabel="Choose leather jersey"
              />
            )}
            {error ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            ) : null}
          </FormSection>

          <FormSection title="Leather jersey details">
            <TextInput name="name" label="Title *" required placeholder="e.g., Honda Castrol 2026" />
            <Textarea name="description" label="Description" rows={3} placeholder="Optional operator notes..." />
            <TextInput
              name="leatherSuitId"
              label="Catalog ID"
              placeholder="Optional. Leave empty to auto-generate from title."
            />
            <TextInput
              name="assetVersion"
              label="Asset version"
              defaultValue="1"
              inputMode="numeric"
              placeholder="1"
            />
            <Checkbox name="isActive" defaultChecked value="true" label="Active (available for event assignment)" />
          </FormSection>

          <Stack gap="sm">
            <Button type="submit" loading={isUploading} disabled={!preview}>
              {isUploading ? 'Uploading…' : 'Create Leather Jersey'}
            </Button>
            <Button variant="default" onClick={() => router.push('/admin/tryon/suits')}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
