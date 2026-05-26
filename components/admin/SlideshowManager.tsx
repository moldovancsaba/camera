'use client';

/**
 * Slideshow Manager Component
 *
 * Client component for managing event slideshows from admin event detail page.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ActionIcon, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@/components/gds/ui';
import { IconCopy, IconExternalLink, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';

interface Slideshow {
  _id: string;
  slideshowId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  bufferSize?: number;
  transitionDurationMs?: number;
  fadeDurationMs?: number;
  refreshStrategy?: 'continuous' | 'batch';
  playMode?: 'once' | 'loop';
  orderMode?: 'fixed' | 'random';
  backgroundPrimaryColor?: string;
  backgroundAccentColor?: string;
  backgroundImageUrl?: string | null;
  viewportScale?: 'fit' | 'fill';
  stageAspect?: number | null;
}

interface Props {
  eventId: string;
  initialSlideshows: Slideshow[];
}

export default function SlideshowManager({ eventId, initialSlideshows }: Props) {
  const [slideshows, setSlideshows] = useState<Slideshow[]>(initialSlideshows);

  const handleDeleteSlideshow = async (slideshowId: string) => {
    if (!confirm('Delete this slideshow?')) return;

    try {
      const response = await fetch(`/api/slideshows?id=${slideshowId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSlideshows(slideshows.filter((slideshow) => slideshow._id !== slideshowId));
      } else {
        alert('Failed to delete slideshow');
      }
    } catch {
      alert('Failed to delete slideshow');
    }
  };

  const copySlideshowUrl = (slideshowId: string) => {
    const url = `${window.location.origin}/slideshow/${slideshowId}`;
    navigator.clipboard.writeText(url);
    alert('Slideshow URL copied to clipboard!');
  };

  return (
    <Card p={0}>
      <Group justify="space-between" align="flex-start" p="xl" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <div>
          <Title order={2}>📺 Event Slideshows</Title>
          <Text c="dimmed" mt="xs">
            Display submissions on screens during the event
          </Text>
        </div>
        <Link href={`/admin/events/${eventId}/slideshows/new`} style={{ textDecoration: 'none' }}>
          <Button color="violet" leftSection={<IconPlus size={16} />}>
            New Slideshow
          </Button>
        </Link>
      </Group>

      {slideshows.length === 0 ? (
        <Stack align="center" gap="sm" p="xl">
          <Text fz={48}>📺</Text>
          <Text fw={700} fz="lg">
            No slideshows yet
          </Text>
          <Text c="dimmed" ta="center">
            Create a slideshow to display event photos on screens with smart playlist rotation
          </Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg" p="xl">
          {slideshows.map((slideshow) => (
            <Card key={slideshow._id} withBorder radius="md" bg="var(--mantine-color-gray-0)">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={700}>{slideshow.name}</Text>
                  <Text size="xs" mt={4} fw={700} c={slideshow.isActive ? 'green.7' : 'gray.6'}>
                    {slideshow.isActive ? '● Active' : '○ Inactive'}
                  </Text>
                </div>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => void handleDeleteSlideshow(slideshow._id)}
                  aria-label="Delete"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>

              <Text size="xs" c="dimmed" mt="md">
                Created {new Date(slideshow.createdAt).toLocaleDateString()}
              </Text>

              <Stack gap="sm" mt="md">
                <Link href={`/admin/events/${eventId}/slideshows/${slideshow._id}`} style={{ textDecoration: 'none' }}>
                  <Button fullWidth color="violet" leftSection={<IconPencil size={16} />}>
                    Edit slideshow
                  </Button>
                </Link>
                <Link href={`/slideshow/${slideshow.slideshowId}`} target="_blank" style={{ textDecoration: 'none' }}>
                  <Button fullWidth color="dark" leftSection={<IconExternalLink size={16} />}>
                    Open Slideshow
                  </Button>
                </Link>
                <Button
                  fullWidth
                  variant="default"
                  size="xs"
                  leftSection={<IconCopy size={14} />}
                  onClick={() => copySlideshowUrl(slideshow.slideshowId)}
                >
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
