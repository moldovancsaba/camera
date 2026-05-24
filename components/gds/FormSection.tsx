'use client';

import { Card, Stack, Text } from '@mantine/core';

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <Card>
      <Stack gap="md">
        <Stack gap={4}>
          <Text fw={700}>{title}</Text>
          {description ? (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          ) : null}
        </Stack>
        {children}
      </Stack>
    </Card>
  );
}
