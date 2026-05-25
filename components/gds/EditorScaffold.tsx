'use client';

import { Stack } from '@mantine/core';
import WorkspaceHeader from '@/components/gds/WorkspaceHeader';

interface EditorScaffoldProps {
  breadcrumbs?: React.ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: number | string;
}

export default function EditorScaffold({
  breadcrumbs,
  eyebrow,
  title,
  description,
  children,
  maxWidth = 960,
}: EditorScaffoldProps) {
  return (
    <Stack gap="xl" maw={maxWidth} mx="auto">
      {breadcrumbs}
      <WorkspaceHeader eyebrow={eyebrow} title={title} description={description} />
      {children}
    </Stack>
  );
}
