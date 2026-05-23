'use client';

/**
 * Add New Frame Page
 *
 * Upload and configure new photo frames.
 */

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  FileButton,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to upload frame';
}

export default function NewFramePage() {
  const router = useRouter();
  const fileInputResetRef = useRef<() => void>(null);
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
    fileInputResetRef.current?.();
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
    <Stack gap="xl" maw={960} mx="auto">
      <WorkspaceHeader
        eyebrow="Resource Inventory"
        title="Add New Frame"
        description="Upload a PNG or SVG frame overlay"
      />

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <Card>
            <Stack gap="md">
              <Text fw={600}>Frame Image *</Text>
              <input type="hidden" name="file-placeholder" value={file?.name || ''} />
              {preview ? (
                <Stack gap="sm">
                  <div
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      background: 'var(--mantine-color-gray-1)',
                      borderRadius: 'var(--mantine-radius-md)',
                      overflow: 'hidden',
                    }}
                  >
                    <Image src={preview} alt="Preview" fill unoptimized style={{ objectFit: 'contain', padding: 32 }} />
                  </div>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      {file?.name}
                    </Text>
                    <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={clearFile}>
                      Remove
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Card withBorder radius="md" bg="var(--mantine-color-gray-0)" p="xl">
                  <Stack align="center" gap="sm">
                    <Text fz={48}>📁</Text>
                    <Text fw={600}>Click to upload or drag and drop</Text>
                    <Text size="sm" c="dimmed">
                      PNG or SVG (MAX. 32MB)
                    </Text>
                    <FileButton resetRef={fileInputResetRef} onChange={handleFileChange} accept=".png,.svg">
                      {(props) => (
                        <Button {...props} leftSection={<IconPhotoPlus size={16} />}>
                          Choose file
                        </Button>
                      )}
                    </FileButton>
                  </Stack>
                </Card>
              )}
              {error ? (
                <Alert color="red" icon={<IconAlertCircle size={16} />}>
                  {error}
                </Alert>
              ) : null}
            </Stack>
          </Card>

          <Card>
            <Stack gap="md">
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
            </Stack>
          </Card>

          <Group>
            <Button type="submit" loading={isUploading} disabled={!preview}>
              {isUploading ? 'Uploading...' : 'Create Frame'}
            </Button>
            <Button variant="default" onClick={() => router.back()}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
