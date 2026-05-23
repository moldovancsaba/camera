'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconCopy, IconExternalLink, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';

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

  const handleDelete = async (mongoId: string) => {
    if (!confirm('Delete this landing page?')) return;
    try {
      const res = await fetch(`/api/landing-pages/${mongoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLandingPages((prev) => prev.filter((page) => page._id !== mongoId));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to delete landing page');
      }
    } catch {
      alert('Failed to delete landing page');
    }
  };

  const copyUrl = (slug: string) => {
    const url = `${window.location.origin}/landing/${slug}`;
    navigator.clipboard.writeText(url);
    alert('Landing page URL copied to clipboard');
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
          <Button color="green" leftSection={<IconPlus size={16} />}>
            New landing page
          </Button>
        </Link>
      </Group>

      {landingPages.length === 0 ? (
        <Stack align="center" gap="sm" p="xl">
          <Text fz={48}>🌐</Text>
          <Text fw={700} fz="lg">
            No landing pages yet
          </Text>
          <Text c="dimmed" ta="center">
            Create an experience page for this event and connect it to one slideshow or one layout
          </Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg" p="xl">
          {landingPages.map((page) => (
            <Card key={page._id} withBorder radius="md" bg="var(--mantine-color-gray-0)">
              <Group justify="space-between" align="flex-start">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Text fw={700} truncate>
                    {page.title?.trim() || page.slug}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4} style={{ wordBreak: 'break-all' }}>
                    /landing/{page.slug}
                  </Text>
                  <Text size="xs" mt="sm" fw={700} c={page.isActive ? 'green.7' : 'gray.6'}>
                    {page.isActive ? '● Active' : '○ Inactive'}
                  </Text>
                </div>
                <ActionIcon variant="subtle" color="red" onClick={() => void handleDelete(page._id)} aria-label="Delete">
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
                  <Button fullWidth color="green" leftSection={<IconPencil size={16} />}>
                    Edit experience page
                  </Button>
                </Link>
                <Link href={`/landing/${page.slug}`} target="_blank" style={{ textDecoration: 'none' }}>
                  <Button fullWidth variant="filled" color="dark" leftSection={<IconExternalLink size={16} />}>
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
