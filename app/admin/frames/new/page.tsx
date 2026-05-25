'use client';

/**
 * Add New Frame Page
 *
 * Upload and configure new photo frames.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Checkbox,
  Select,
  Stack,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import EditorScaffold from '@/components/gds/EditorScaffold';
import FormSection from '@/components/gds/FormSection';
import UploadDropzone from '@/components/gds/UploadDropzone';
import MediaCard from '@/components/gds/MediaCard';

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
        <Stack gap="lg">
          <FormSection title="Frame Image *">
            <input type="hidden" name="file-placeholder" value={file?.name || ''} />
            {preview ? (
              <MediaCard
                src={preview}
                alt="Frame preview"
                caption={file?.name}
                action={
                  <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                    Remove
                  </Button>
                }
              />
            ) : (
              <UploadDropzone
                accept={['image/png', 'image/svg+xml']}
                icon={<IconPhotoPlus size={40} color="var(--mantine-color-gray-6)" />}
                title="Click to upload or drag and drop"
                description="PNG or SVG (MAX. 32MB)"
                onFile={handleFileChange}
              />
            )}
            {error ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            ) : null}
          </FormSection>

          <FormSection title="Frame Details">
            <TextInput name="name" label="Frame Name *" required placeholder="e.g., Holiday Frame 2024" />
            <Textarea name="description" label="Description" rows={3} placeholder="Optional description..." />
            <Select
              name="category"
              label="Category"
              defaultValue="general"
              data={[
                { value: 'general', label: 'General' },
                { value: 'holiday', label: 'Holiday' },
                { value: 'birthday', label: 'Birthday' },
                { value: 'wedding', label: 'Wedding' },
                { value: 'corporate', label: 'Corporate' },
              ]}
            />
            <Checkbox name="isActive" defaultChecked value="true" label="Make frame active (visible to users)" />
          </FormSection>

          <Stack gap="sm">
            <Button type="submit" loading={isUploading} disabled={!preview}>
              {isUploading ? 'Uploading...' : 'Create Frame'}
            </Button>
            <Button variant="default" onClick={() => router.back()}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
