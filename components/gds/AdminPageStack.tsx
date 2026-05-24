'use client';

import { Stack } from '@mantine/core';

export default function AdminPageStack({ children }: { children: React.ReactNode }) {
  return <Stack gap="xl">{children}</Stack>;
}
