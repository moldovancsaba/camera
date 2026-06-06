'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
import { FormSection } from '@doneisbetter/gds-admin/client';
import { StateBlock } from '@doneisbetter/gds-core/client';

interface TryOnSuitRecord {
  _id: string;
  leatherSuitId: string;
  name: string;
  description?: string | null;
  assetVersion?: number;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  sourceImageUrl?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  usageCount?: number;
  isActive?: boolean;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Leather jersey request failed';
}

export default function EditTryOnSuitPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [suit, setSuit] = useState<TryOnSuitRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSuit() {
      try {
        const response = await fetch(`/api/admin/tryon-suits/${id}`);
        if (!response.ok) throw new Error('Leather jersey not found');
        const data = await response.json();
        setSuit(data.suit || data.data?.suit || data);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }

    void fetchSuit();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const updateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      assetVersion: formData.get('assetVersion'),
      active: formData.get('active') === 'on',
    };

    try {
      const response = await fetch(`/api/admin/tryon-suits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update leather jersey');
      }

      router.push('/admin/tryon/suits');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this leather jersey? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/tryon-suits/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete leather jersey');
      }

      router.push('/admin/tryon/suits');
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifications.show({ title: 'Delete failed', message, color: 'red' });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading leather jersey…" />;
  }

  if (!suit) {
    return (
      <StateBlock
        variant="error"
        title="Leather jersey not found"
        description={error || undefined}
        action={
          <Button component={Link} href="/admin/tryon/suits" variant="light">
            Back to leather jerseys
          </Button>
        }
      />
    );
  }

  const preview = suit.thumbnailUrl || suit.previewUrl || suit.imageUrl || suit.sourceImageUrl || '';

  return (
    <EditorScaffold
      eyebrow="Apps"
      title="Edit Leather Jersey"
      description="Update leather jersey details and publishing state."
      breadcrumbs={
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/tryon/suits" size="sm">
            Garments
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
          <FormSection title="Leather jersey preview" description="To change the image, delete this leather jersey and upload a new one.">
            <AspectRatio ratio={1} maw={320}>
              <Box style={{ borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                {preview ? (
                  <Image
                    src={preview}
                    alt={suit.name}
                    fill
                    style={{ objectFit: 'contain', padding: 24 }}
                    unoptimized
                  />
                ) : null}
              </Box>
            </AspectRatio>
          </FormSection>

          <FormSection title="Technical information">
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm" c="dimmed">Catalog ID</Text>
                <Code block>{suit.leatherSuitId}</Code>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm" c="dimmed">MongoDB ID</Text>
                <Code block>{suit._id}</Code>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Asset version: {suit.assetVersion || 1}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">File size: {suit.fileSize ? `${(suit.fileSize / 1024).toFixed(2)} KB` : 'N/A'}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">MIME type: {suit.mimeType || 'N/A'}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Queue usage: {suit.usageCount || 0}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Created: {suit.createdAt ? new Date(suit.createdAt).toLocaleString() : 'N/A'}</Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">Updated: {suit.updatedAt ? new Date(suit.updatedAt).toLocaleString() : 'N/A'}</Text>
              </Grid.Col>
            </Grid>
            {suit.imageUrl ? (
              <Anchor href={suit.imageUrl} target="_blank" rel="noopener noreferrer" size="sm">
                Open asset image URL
              </Anchor>
            ) : null}
            {suit.thumbnailUrl ? (
              <Anchor href={suit.thumbnailUrl} target="_blank" rel="noopener noreferrer" size="sm">
                Open thumbnail URL
              </Anchor>
            ) : null}
          </FormSection>

          <FormSection title="Leather jersey details">
            <TextInput name="name" label="Title *" required defaultValue={suit.name} />
            <Textarea name="description" label="Description" rows={3} defaultValue={suit.description || ''} />
            <TextInput
              name="assetVersion"
              label="Asset version"
              defaultValue={String(suit.assetVersion || 1)}
              inputMode="numeric"
            />
            <Checkbox
              name="active"
              defaultChecked={suit.active ?? suit.isActive}
              label="Active (available for assignment to events)"
            />
          </FormSection>

          <Group justify="space-between">
            <Group>
              <Button type="submit" loading={isSaving}>
                {isSaving ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button component={Link} href="/admin/tryon/suits" variant="default">
                Cancel
              </Button>
            </Group>
            <Button variant="light" loading={isDeleting} onClick={() => void handleDelete()}>
              Delete Leather Jersey
            </Button>
          </Group>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
