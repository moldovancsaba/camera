'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';

export interface SlideshowLayoutListItem {
  _id: string;
  layoutId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  eventMongoId: string;
  initialLayouts: SlideshowLayoutListItem[];
}

export default function SlideshowLayoutManager({
  eventMongoId,
  initialLayouts,
}: Props) {
  const [layouts, setLayouts] = useState(initialLayouts);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const name = prompt('Layout name (e.g. Main videowall):');
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/slideshow-layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: eventMongoId, name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to create layout');
        return;
      }
      const data = await res.json();
      setLayouts([
        {
          _id: data.layout._id,
          layoutId: data.layout.layoutId,
          name: data.layout.name,
          isActive: data.layout.isActive,
          createdAt: data.layout.createdAt,
        },
        ...layouts,
      ]);
    } catch {
      alert('Failed to create layout');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (mongoId: string) => {
    if (!confirm('Delete this slideshow layout?')) return;
    try {
      const res = await fetch(`/api/slideshow-layouts?id=${mongoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLayouts(layouts.filter((l) => l._id !== mongoId));
      } else {
        alert('Failed to delete');
      }
    } catch {
      alert('Failed to delete');
    }
  };

  const copyUrl = (layoutId: string) => {
    const url = `${window.location.origin}/slideshow-layout/${layoutId}`;
    navigator.clipboard.writeText(url);
    alert('Layout URL copied to clipboard');
  };

  return (
    <Card withBorder radius="lg" p="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={2}>Event Slideshow Layouts</Title>
            <Text c="dimmed">
              Combine multiple slideshows on one screen.
            </Text>
          </Stack>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'New layout'}
          </Button>
        </Group>

      {layouts.length === 0 ? (
          <Stack align="center" py="xl" gap="sm">
            <Text fz="3rem" aria-hidden>
              🎛️
            </Text>
            <Title order={3}>
            No layouts yet
            </Title>
            <Text c="dimmed" ta="center">
            Create a layout to assign slideshows to regions on a shared display
            </Text>
          </Stack>
      ) : (
          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
            {layouts.map((layout) => (
              <Card
                key={layout._id}
                withBorder
                radius="md"
                p="md"
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                      <Text fw={700}>
                      {layout.name}
                      </Text>
                      <Badge variant="light">
                      {layout.isActive ? '● Active' : '○ Inactive'}
                      </Badge>
                    </Stack>
                    <Button
                    type="button"
                    onClick={() => handleDelete(layout._id)}
                      variant="subtle"
                      size="compact-sm"
                    title="Delete"
                  >
                    🗑️
                    </Button>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Created {new Date(layout.createdAt).toLocaleDateString()}
                  </Text>
                  <Button
                    component={Link}
                    href={`/admin/events/${eventMongoId}/layouts/${layout._id}`}
                    fullWidth
                  >
                    Edit layout
                  </Button>
                  <Button
                    component={Link}
                    href={`/slideshow-layout/${layout.layoutId}`}
                    target="_blank"
                    fullWidth
                    variant="light"
                  >
                    Open layout
                  </Button>
                  <Button
                    type="button"
                    onClick={() => copyUrl(layout.layoutId)}
                    fullWidth
                    variant="default"
                  >
                    Copy public URL
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
      )}
      </Stack>
    </Card>
  );
}
