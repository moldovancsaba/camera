'use client';

import { Card, SimpleGrid, Stack, Text, Title } from '@mantine/core';

interface AccessSummaryItem {
  label: string;
  value: React.ReactNode;
}

interface AccessSummaryProps {
  title?: string;
  description?: string;
  items: AccessSummaryItem[];
}

export default function AccessSummary({
  title = 'Access Summary',
  description,
  items,
}: AccessSummaryProps) {
  return (
    <Card>
      <Stack gap="md">
        <div>
          <Title order={3}>{title}</Title>
          {description ? (
            <Text size="sm" c="dimmed" mt="xs">
              {description}
            </Text>
          ) : null}
        </div>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {items.map((item) => (
            <Stack key={item.label} gap={4}>
              <Text size="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.08em' }}>
                {item.label}
              </Text>
              <Text fw={700} style={{ textTransform: 'capitalize' }}>
                {item.value}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
