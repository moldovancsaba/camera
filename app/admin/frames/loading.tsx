'use client';

import { Card, SimpleGrid, Skeleton, Stack } from '@mantine/core';

export default function FramesLoading() {
  return (
    <Stack gap="xl">
      <Skeleton height={36} width={280} radius="md" />
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {[1, 2, 3].map((item) => (
          <Card key={item}>
            <Skeleton height={64} radius="md" />
          </Card>
        ))}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3, xl: 4 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
          <Card key={item} p={0}>
            <Skeleton height={220} radius={0} />
            <Stack p="md" gap="sm">
              <Skeleton height={16} width="70%" radius="md" />
              <Skeleton height={12} width="90%" radius="md" />
              <Skeleton height={32} radius="md" />
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
