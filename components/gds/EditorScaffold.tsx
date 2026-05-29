'use client';

import { Stack } from '@mantine/core';
import { EditorScaffold as GdsEditorScaffold, WorkspaceHeader as GdsWorkspaceHeader } from '@doneisbetter/gds-admin/client';
import type { ReactNode } from 'react';

interface EditorScaffoldProps {
  breadcrumbs?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  form?: ReactNode;
  preview?: ReactNode;
  settings?: ReactNode;
  footer?: ReactNode;
  stickyFooter?: boolean;
  maxWidth?: number | string;
}

export default function EditorScaffold({
  breadcrumbs,
  eyebrow,
  title,
  description,
  children,
  form,
  preview,
  settings,
  footer,
  stickyFooter,
  maxWidth = 960,
}: EditorScaffoldProps) {
  const resolvedForm = form ?? children;

  return (
    <Stack maw={maxWidth} mx="auto">
      <GdsEditorScaffold
        context={breadcrumbs}
        header={<GdsWorkspaceHeader eyebrow={eyebrow} title={title} description={description} />}
        form={resolvedForm}
        preview={preview}
        settings={settings}
        footer={footer}
        stickyFooter={stickyFooter}
      />
    </Stack>
  );
}
