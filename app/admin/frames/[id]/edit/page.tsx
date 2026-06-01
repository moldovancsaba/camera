/**
 * Edit Frame Page
 */

'use client';

import { useEffect, useState, use } from 'react';
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
  NativeSelect,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { notifications } from '@/lib/gds/notifications';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import { FormSection } from '@doneisbetter/gds-admin/client';
import { StateBlock } from '@doneisbetter/gds-core/client';
import { confirmDestructive } from '@/lib/gds/confirm-destructive';

interface FrameRecord {
  _id: string;
  frameId?: string;
  name: string;
  description?: string;
  category?: string;
  isActive?: boolean;
  thumbnailUrl?: string;
  imageUrl: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Frame request failed';
}

export default function EditFramePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [frame, setFrame] = useState<FrameRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFrame() {
      try {
        const response = await fetch(`/api/frames/${id}`);
        if (!response.ok) throw new Error('Frame not found');
        const data = await response.json();
        setFrame(data.frame);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    }

    void fetchFrame();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const updateData = {
      name: formData.get('name'),
      description: formData.get('description'),
      category: formData.get('category'),
      isActive: formData.get('isActive') === 'on',
    };

    try {
      const response = await fetch(`/api/frames/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update frame');
      }

      router.push('/admin/frames');
      router.refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/frames/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete frame');
      }

      router.push('/admin/frames');
      router.refresh();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      notifications.show({ title: 'Delete failed', message, color: 'red' });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <StateBlock variant="loading" title="Loading frame…" />;
  }

  if (!frame) {
    return (
      <StateBlock
        variant="error"
        title="Frame not found"
        description={error || undefined}
        action={
          <Button component={Link} href="/admin/frames" variant="light">
            Back to frames
          </Button>
        }
      />
    );
  }

  return (
    <Stack gap="xl" maw={960} mx="auto">
      <Breadcrumbs>
        <Anchor component={Link} href="/admin/frames" size="sm">
          Frames
        </Anchor>
        <Text size="sm">Edit</Text>
      </Breadcrumbs>

      <WorkspaceHeader
        eyebrow="Camera Core"
        title="Edit Frame"
        description="Update frame details and settings."
      />

      {error ? (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          <Text fw={700}>Error</Text>
          <Text size="sm">{error}</Text>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <FormSection title="Frame preview" description="To change the image, delete this frame and upload a new one.">
            <AspectRatio ratio={1} maw={320}>
              <Box bg="gray.0" style={{ borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                <Image src={frame.thumbnailUrl || frame.imageUrl} alt={frame.name} fill style={{ objectFit: 'contain', padding: 24 }} unoptimized />
              </Box>
            </AspectRatio>
          </FormSection>

          <FormSection title="Frame details">
            <TextInput name="name" label="Frame name" required defaultValue={frame.name} />
            <Textarea name="description" label="Description" rows={3} defaultValue={frame.description} />
            <NativeSelect
              name="category"
              label="Category"
              defaultValue={frame.category || 'general'}
              data={[
                { value: 'general', label: 'General' },
                { value: 'holiday', label: 'Holiday' },
                { value: 'birthday', label: 'Birthday' },
                { value: 'wedding', label: 'Wedding' },
                { value: 'corporate', label: 'Corporate' },
              ]}
            />
            <Checkbox name="isActive" defaultChecked={frame.isActive} label="Make frame active (visible to users)" />
          </FormSection>

          <FormSection title="Technical information">
            <Grid>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm" c="dimmed">
                  Frame ID
                </Text>
                <Code block>{frame.frameId || 'Not assigned'}</Code>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm" c="dimmed">
                  MongoDB ID
                </Text>
                <Code block>{frame._id}</Code>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">
                  Dimensions: {frame.width || 'N/A'} × {frame.height || 'N/A'} px
                </Text>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Text size="sm">
                  File size: {frame.fileSize ? `${(frame.fileSize / 1024).toFixed(2)} KB` : 'N/A'}
                </Text>
              </Grid.Col>
            </Grid>
            <Anchor href={frame.imageUrl} target="_blank" rel="noopener noreferrer" size="sm">
              Open image URL
            </Anchor>
          </FormSection>

          <Group justify="space-between">
            <Group>
              <Button type="submit" color="teal" loading={isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button component={Link} href="/admin/frames" variant="default">
                Cancel
              </Button>
            </Group>
            <Button
              type="button"
              color="red"
              variant="light"
              loading={isDeleting}
              disabled={isDeleting}
              onClick={() =>
                confirmDestructive({
                  title: 'Delete frame',
                  message: 'Are you sure you want to delete this frame? This cannot be undone.',
                  targetName: frame.name,
                  onConfirm: () => void handleDelete(),
                })
              }
            >
              Delete frame
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
