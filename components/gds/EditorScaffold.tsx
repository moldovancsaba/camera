'use client';

import { Stack } from '@mantine/core';
import { EditorScaffold as GdsEditorScaffold, WorkspaceHeader as GdsWorkspaceHeader } from '@doneisbetter/gds-admin/client';

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
    <Stack maw={maxWidth} mx="auto">
      <GdsEditorScaffold
        context={breadcrumbs}
        header={<GdsWorkspaceHeader eyebrow={eyebrow} title={title} description={description} />}
        form={children}
      />
    </Stack>
  );
}
