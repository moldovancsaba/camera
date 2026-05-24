'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import StatusBadge from '@/components/gds/StatusBadge';
import StateBlock from '@/components/gds/StateBlock';

export interface SerializedFrameRow {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  imageUrl: string;
  isActive: boolean;
  scope: 'global' | 'partner' | 'event';
  usageCount: number;
  partnerId?: string | null;
  partnerName?: string | null;
  partnerAdminId?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  eventAdminId?: string | null;
}

export default function FramesInventoryList({ frames }: { frames: SerializedFrameRow[] }) {
  if (frames.length === 0) {
    return (
      <Card p="xl">
        <StateBlock
          variant="empty"
          title="No frames yet"
          description="Add your first shared frame to start assigning it across partners and apps."
          action={
            <Button component={Link} href="/admin/frames/new" color="cameraTeal">
              Add Your First Frame
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing="lg">
      {frames.map((frame) => (
        <Card key={frame.id} p={0} style={{ overflow: 'hidden' }}>
          <div style={{ position: 'relative', background: 'var(--mantine-color-gray-1)', aspectRatio: '1', maxHeight: '300px' }}>
            <Image
              src={frame.imageUrl}
              alt={frame.name}
              fill
              style={{ objectFit: 'contain', padding: 16 }}
              unoptimized
            />
          </div>
          <Stack gap="sm" p="md">
            <Group gap="xs">
              <StatusBadge
                tone={frame.scope === 'event' ? 'active' : frame.scope === 'partner' ? 'info' : 'inactive'}
                label={frame.scope === 'global' ? 'Global' : frame.scope === 'partner' ? 'Partner' : 'Event'}
              />
              <StatusBadge tone={frame.isActive ? 'active' : 'inactive'} />
            </Group>
            <Text fw={700} c="dark.8">
              {frame.name}
            </Text>
            {frame.description ? (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {frame.description}
              </Text>
            ) : null}
            <Stack gap={2}>
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="dimmed" tt="capitalize">
                  {frame.category || 'general'}
                </Text>
                <Text size="xs" c="dimmed">
                  Used {frame.usageCount} time{frame.usageCount === 1 ? '' : 's'}
                </Text>
              </Group>
              {frame.scope === 'partner' && frame.partnerAdminId && frame.partnerName ? (
                <Text size="xs" c="dimmed">
                  Partner:{' '}
                  <Text
                    component={Link}
                    href={`/admin/partners/${frame.partnerAdminId}`}
                    span
                    c="blue.7"
                    style={{ textDecoration: 'none' }}
                  >
                    {frame.partnerName}
                  </Text>
                </Text>
              ) : null}
              {frame.scope === 'event' && frame.eventAdminId && frame.eventName ? (
                <Text size="xs" c="dimmed">
                  Event:{' '}
                  <Text
                    component={Link}
                    href={`/admin/events/${frame.eventAdminId}`}
                    span
                    c="blue.7"
                    style={{ textDecoration: 'none' }}
                  >
                    {frame.eventName}
                  </Text>
                </Text>
              ) : null}
            </Stack>
            <Button component={Link} href={`/admin/frames/${frame.id}/edit`} fullWidth color="cameraTeal">
              Edit
            </Button>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}
