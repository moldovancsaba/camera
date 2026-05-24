'use client';

import { Box, Stack, Text, Title } from '@mantine/core';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Stack align="center" justify="center" gap="md" py="xl" ta="center">
      {icon ? <Box c="dimmed">{icon}</Box> : null}
      <Title order={3}>{title}</Title>
      <Text c="dimmed" maw={420}>
        {description}
      </Text>
      {action ? <Box mt="sm">{action}</Box> : null}
    </Stack>
  );
}
