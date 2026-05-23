/**
 * Admin Loading State
 */

import { Card, SimpleGrid, Skeleton, Stack } from '@mantine/core';

export default function AdminLoading() {
  return (
    <Stack gap="xl">
      <Stack gap="sm">
        <Skeleton height={12} width={120} radius="xl" />
        <Skeleton height={36} width={240} radius="md" />
        <Skeleton height={18} width={420} radius="md" />
      </Stack>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {[1, 2, 3].map((item) => (
          <Card key={item}>
            <Skeleton height={64} radius="md" />
          </Card>
        ))}
      </SimpleGrid>

      <Card>
        <Stack gap="md">
          <Skeleton height={24} width={180} radius="md" />
          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }}>
            {[1, 2, 3, 4].map((item) => (
              <Skeleton key={item} height={96} radius="md" />
            ))}
          </SimpleGrid>
        </Stack>
      </Card>
    </Stack>
  );
}
