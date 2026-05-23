/**
 * Frames Loading State
 */

import { Card, SimpleGrid, Skeleton, Stack } from '@mantine/core';

export default function FramesLoading() {
  return (
    <Stack gap="xl">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <Stack gap="sm">
          <Skeleton height={36} width={160} radius="md" />
          <Skeleton height={18} width={280} radius="md" />
        </Stack>
        <Skeleton height={42} width={140} radius="md" />
      </div>

      <SimpleGrid cols={{ base: 1, md: 2, lg: 3, xl: 4 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
          <Card key={item} p={0} style={{ overflow: 'hidden' }}>
            <Skeleton height={220} radius={0} />
            <Stack gap="sm" p="md">
              <Skeleton height={16} width="70%" radius="md" />
              <Skeleton height={12} width="100%" radius="md" />
              <Skeleton height={12} width="50%" radius="md" />
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
