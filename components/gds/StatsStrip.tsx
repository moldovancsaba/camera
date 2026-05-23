import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine/core';

export interface StatItem {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: 'primary' | 'neutral';
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
            {item.icon ? (
              <ThemeIcon
                color={item.tone === 'neutral' ? 'gray' : 'cameraTeal'}
                variant="light"
                size={44}
                radius="xl"
              >
                {item.icon}
              </ThemeIcon>
            ) : null}
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}
