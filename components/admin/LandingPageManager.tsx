'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Alert, Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconCopy, IconExternalLink, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { notifications } from '@/lib/gds/notifications';
import { confirmDestructive } from '@/lib/gds/confirm-destructive';
import { EmptyState } from '@doneisbetter/gds-core/client';

export interface LandingPageListItem {
  _id: string;
  slug: string;
  title?: string | null;
  targetType: 'slideshow' | 'layout';
  targetName: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  eventMongoId: string;
  initialLandingPages: LandingPageListItem[];
}

export default function LandingPageManager({
  eventMongoId,
  initialLandingPages,
}: Props) {
  const [landingPages, setLandingPages] = useState(initialLandingPages);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (mongoId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/landing-pages/${mongoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete landing page');
      }
      setLandingPages((prev) => prev.filter((page) => page._id !== mongoId));
      notifications.show({ title: 'Landing page deleted', message: 'Experience page removed.' });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Failed to delete landing page';
      setError(message);
      notifications.show({ title: 'Delete failed', message });
    }
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/landing/${slug}`;
    void navigator.clipboard.writeText(url);
    notifications.show({ title: 'URL copied', message: 'Landing page URL copied to clipboard.' });
  };

  return (
    <Card p={0}>
      <Group justify="space-between" align="flex-start" p="xl" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <div>
          <Title order={2}>🌐 Experience Landing Pages</Title>
          <Text c="dimmed" mt="xs">
            Public experience surfaces for this event. They can embed a slideshow or layout and route visitors into
            app actions like capture.
          </Text>
        </div>
        <Link href={`/admin/events/${eventMongoId}/landing-pages/new`} style={{ textDecoration: 'none' }}>
          <Button leftSection={<IconPlus size={16} />}>
            New landing page
          </Button>
        </Link>
      </Group>

      {error ? (
        <Alert mx="xl" mt="xl">
          {error}
        </Alert>
      ) : null}

      {landingPages.length === 0 ? (
        <Stack p="xl">
          <EmptyState
            title="No landing pages yet"
            description="Create an experience page for this event and connect it to one slideshow or one layout."
          />
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg" p="xl">
          {landingPages.map((page) => (
            <Card key={page._id} withBorder radius="md">
              <Group justify="space-between" align="flex-start">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text fw={700} truncate>
                    {page.title?.trim() || page.slug}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4} style={{ wordBreak: 'break-all' }}>
                    /landing/{page.slug}
                  </Text>
                  <Badge mt="sm" variant="light">
                    {page.isActive ? '● Active' : '○ Inactive'}
                  </Badge>
                </div>
                <ActionIcon
                  variant="subtle"
                  aria-label="Delete"
                  onClick={() =>
                    confirmDestructive({
                      title: 'Delete landing page',
                      message: 'Are you sure you want to delete this landing page?',
                      targetName: page.title?.trim() || page.slug,
                      onConfirm: () => void handleDelete(page._id),
                    })
                  }
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>

              <Stack gap="xs" mt="md">
                <Text size="xs" c="dimmed">
                  Embedded experience: {page.targetType === 'layout' ? 'Layout' : 'Slideshow'} · {page.targetName}
                </Text>
                <Text size="xs" c="dimmed">
                  Created {new Date(page.createdAt).toLocaleDateString()}
                </Text>
              </Stack>

              <Stack gap="sm" mt="md">
                <Link href={`/admin/events/${eventMongoId}/landing-pages/${page._id}`} style={{ textDecoration: 'none' }}>
                  <Button fullWidth leftSection={<IconPencil size={16} />}>
                    Edit experience page
                  </Button>
                </Link>
                <Link href={`/landing/${page.slug}`} target="_blank" style={{ textDecoration: 'none' }}>
                  <Button fullWidth variant="light" leftSection={<IconExternalLink size={16} />}>
                    Open landing page
                  </Button>
                </Link>
                <Button fullWidth variant="default" size="xs" leftSection={<IconCopy size={14} />} onClick={() => copyUrl(page.slug)}>
                  Copy public URL
                </Button>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Card>
  );
}
