/**
 * Edit Logo Page
 * 
 * Full CRUD - Update logo details and toggle active status.
 */

'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Alert,
  Anchor,
  AspectRatio,
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  Code,
  Grid,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { notifications } from '@/lib/gds/notifications';
import EditorScaffold from '@/components/gds/EditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/server';
import { StateBlock } from '@doneisbetter/gds-core/server';
import { confirmDestructive } from '@/lib/gds/confirm-destructive';

interface LogoRecord {
  _id: string;
  logoId?: string;
  name: string;
  description?: string;
  isActive?: boolean;
  imageUrl: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  usageCount?: number;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Logo request failed';
}

export default function EditLogoPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [logo, setLogo] = useState<LogoRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogo() {
      try {
        const response = await fetch(`/api/logos/${id}`);
        if (!response.ok) throw new Error('Logo not found');
        const data = await response.json();
        // Handle wrapped response
        const logoData = data.logo || data.data?.logo || data;
        setLogo(logoData);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }

    void fetchLogo();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const updateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      isActive: formData.get('isActive') === 'on',
    };

    try {
      const response = await fetch(`/api/logos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update logo');
      }

      router.push('/admin/logos');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this logo? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/logos/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete logo');
      }

      router.push('/admin/logos');
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifications.show({ title: 'Delete failed', message, color: 'red' });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading logo…" />;
  }

  if (!logo) {
    return (
      <StateBlock
        variant="error"
        title="Logo not found"
        description={error || undefined}
        action={
          <Button component={Link} href="/admin/logos" variant="light">
            Back to logos
          </Button>
        }
      />
    );
  }

  return (
    <EditorScaffold
      eyebrow="Camera Core"
      title="Edit Logo"
      description="Update logo details and settings."
      breadcrumbs={
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/logos" size="sm">
            Logos
          </Anchor>
          <Text size="sm">Edit</Text>
        </Breadcrumbs>
      }
      maxWidth={960}
    >
      {error ? (
        <Alert icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Logo preview" description="To change the image, delete this logo and upload a new one.">
            <AspectRatio ratio={1} maw={320}>
              <Box style={{ borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                <Image
                  src={logo.thumbnailUrl || logo.imageUrl}
                  alt={logo.name}
                  fill
                  style={{ objectFit: 'contain', padding: 24 }}
                  unoptimized
                />
              </Box>
            </AspectRatio>
          </FormSection>

          <FormSection title="Technical information">
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm" c="dimmed">Logo ID</Text>
                <Code block>{logo.logoId || 'Not assigned'}</Code>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm" c="dimmed">MongoDB ID</Text>
                <Code block>{logo._id}</Code>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Dimensions: {logo.width || 'N/A'} × {logo.height || 'N/A'} px</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">File size: {logo.fileSize ? `${(logo.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">MIME type: {logo.mimeType || 'N/A'}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Usage count: {logo.usageCount || 0}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Created: {logo.createdAt ? new Date(logo.createdAt).toLocaleString() : 'N/A'}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Updated: {logo.updatedAt ? new Date(logo.updatedAt).toLocaleString() : 'N/A'}</Text>
              </Grid.Col>
            </Grid>
            <Anchor href={logo.imageUrl} target="_blank" rel="noopener noreferrer" size="sm">
              Open image URL
            </Anchor>
            {logo.thumbnailUrl ? (
              <Anchor href={logo.thumbnailUrl} target="_blank" rel="noopener noreferrer" size="sm">
                Open thumbnail URL
              </Anchor>
            ) : null}
          </FormSection>

          <FormSection title="Logo details">
            <TextInput name="name" label="Logo Name *" required defaultValue={logo.name} />
            <Textarea name="description" label="Description" rows={3} defaultValue={logo.description} />
            <Checkbox
              name="isActive"
              defaultChecked={logo.isActive}
              label="Make logo active (available for assignment to events)"
            />
          </FormSection>

          <Group justify="space-between">
            <Group>
              <Button type="submit" loading={isSaving}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button component={Link} href="/admin/logos" variant="default">
                Cancel
              </Button>
            </Group>
            <Button
              type="button"
              variant="light"
              loading={isDeleting}
              disabled={isDeleting}
              onClick={() =>
                confirmDestructive({
                  title: 'Delete logo',
                  message: 'Are you sure you want to delete this logo? This cannot be undone.',
                  targetName: logo.name,
                  onConfirm: () => void handleDelete(),
                })
              }
            >
              Delete Logo
            </Button>
          </Group>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
