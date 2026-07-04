'use client';

import { EditorScaffold, WorkspaceHeader } from '@sovereignsquad/gds-admin/client';
import type { ReactNode } from 'react';

interface AdminEditorScaffoldProps {
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

export default function AdminEditorScaffold({
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
}: AdminEditorScaffoldProps) {
  const resolvedForm = form ?? children;

  return (
    <div style={{ marginInline: 'auto', maxWidth }}>
      <EditorScaffold
        context={breadcrumbs}
        header={<WorkspaceHeader eyebrow={eyebrow} title={title} description={description} />}
        form={resolvedForm}
        preview={preview}
        settings={settings}
        footer={footer}
        stickyFooter={stickyFooter}
      />
    </div>
  );
}
