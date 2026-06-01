'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Button, Card, SimpleGrid, Stack, Text } from '@mantine/core';
import { StateBlock, StatusBadge } from '@doneisbetter/gds-core/client';
import { getStatusBadgeProps } from '@/lib/gds/presentation';

export interface SerializedTryOnSuitRow {
  id: string;
  leatherSuitId: string;
  name: string;
  description?: string | null;
  imageUrl: string;
  thumbnailUrl?: string | null;
  isActive: boolean;
  eventAssignmentCount: number;
  queueUsageCount: number;
}

export default function TryOnSuitsInventoryList({ suits }: { suits: SerializedTryOnSuitRow[] }) {
  if (suits.length === 0) {
    return (
      <Card p="xl">
        <StateBlock
          variant="empty"
          title="No leather jerseys yet"
          description="Upload your first shared leather jersey so try-on events can offer it to users."
          action={
            <Button component={Link} href="/admin/tryon/suits/new">
              Upload First Leather Jersey
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="lg">
      {suits.map((suit) => (
        <Card key={suit.id} p={0} style={{ overflow: 'hidden' }}>
          <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--mantine-color-gray-1)' }}>
            <Image
              src={suit.thumbnailUrl || suit.imageUrl}
              alt={suit.name}
              fill
              style={{ objectFit: 'contain', padding: 16 }}
              unoptimized
            />
            <div style={{ position: 'absolute', top: 8, right: 8 }}>
              <StatusBadge {...getStatusBadgeProps(suit.isActive ? 'active' : 'inactive')} />
            </div>
          </div>
          <Stack gap="sm" p="md">
            <Text fw={700} truncate="end">
              {suit.name}
            </Text>
            {suit.description ? (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {suit.description}
              </Text>
            ) : null}
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Catalog ID: {suit.leatherSuitId}
              </Text>
              <Text size="xs" c="dimmed">
                Event allowlists: {suit.eventAssignmentCount}
              </Text>
              <Text size="xs" c="dimmed">
                Queue usage: {suit.queueUsageCount}
              </Text>
            </Stack>
            <Button component={Link} href={`/admin/tryon/suits/${suit.id}/edit`} fullWidth>
              Edit
            </Button>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}
