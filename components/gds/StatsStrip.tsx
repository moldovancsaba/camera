'use client';

import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';
import { AdminIcon, type AdminIconKey } from '@/lib/gds/admin-icon-key';

export interface StatItem {
  label: string;
  value: string | number;
  iconKey?: AdminIconKey;
}

export default function StatsStrip({ items }: { items: StatItem[] }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: Math.min(items.length, 4) }} spacing="lg">
      {items.map((item) => (
        <Card key={item.label}>
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text size="sm" c="gray.6">
                {item.label}
              </Text>
              <Text fw={800} fz={34} c="dark.8">
                {item.value}
              </Text>
            </Stack>
            {item.iconKey ? (
              <ThemeIcon color="cameraTeal" variant="light" size={44} radius="xl">
                <AdminIcon iconKey={item.iconKey} size={20} />
              </ThemeIcon>
            ) : null}
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}
