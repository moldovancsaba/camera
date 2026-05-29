'use client';

import { Group, Stack, Text } from '@mantine/core';
import { DataToolbar as GdsDataToolbar } from '@doneisbetter/gds-core/client';

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
    <GdsDataToolbar
      searchSlot={
        <Stack gap="md" style={{ flex: 1 }}>
          {hint ? (
            <Text size="sm" c="dimmed">
              {hint}
            </Text>
          ) : null}
          <Group align="flex-end" wrap="wrap" gap="md" style={{ flex: 1 }}>
            {children}
          </Group>
        </Stack>
      }
      activeFilters={filters?.map((chip) => ({
        label: `${chip.label}: ${chip.value}`,
      }))}
      createAction={trailing}
    />
  );
}
