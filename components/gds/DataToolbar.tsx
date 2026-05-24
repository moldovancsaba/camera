'use client';

import { Card, Group, Stack, Text } from '@mantine/core';

export interface DataToolbarFilterChip {
  label: string;
  value: string;
}

export interface DataToolbarProps {
  hint?: string;
  filters?: DataToolbarFilterChip[];
  children: React.ReactNode;
  trailing?: React.ReactNode;
}

export default function DataToolbar({ hint, filters, children, trailing }: DataToolbarProps) {
  return (
    <Card>
      <Stack gap="md">
        {hint ? (
          <Text size="sm" c="dimmed">
            {hint}
          </Text>
        ) : null}
        {filters && filters.length > 0 ? (
          <Group gap="xs">
            {filters.map((chip) => (
              <Text key={chip.label} size="sm" c="dimmed">
                {chip.label}:{' '}
                <Text span fw={700} c="dark.8">
                  {chip.value}
                </Text>
              </Text>
            ))}
          </Group>
        ) : null}
        <Group align="flex-end" wrap="wrap" gap="md">
          <Group align="flex-end" wrap="wrap" gap="md" style={{ flex: 1 }}>
            {children}
          </Group>
          {trailing}
        </Group>
      </Stack>
    </Card>
  );
}
