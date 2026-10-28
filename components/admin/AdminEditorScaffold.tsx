'use client';

import { EditorScaffold, WorkspaceHeader } from '@sovereignsquad/gds-admin/client';
import type { ReactNode } from 'react';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

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
  const language = useUiLanguage();
  const ui = (text: string | undefined) => text === undefined ? undefined : adminOperationText(text, language);
  const headerCopy = [eyebrow, title, description].filter((text): text is string => Boolean(text?.trim()));
  const headerIsLocalized = headerCopy.length > 0 && headerCopy.every((text) => ui(text) !== text);

  return (
    <div dir={uiLanguageDirection(language)} style={{ marginInline: 'auto', maxWidth }}>
      <EditorScaffold
        context={breadcrumbs}
        header={<div lang={headerIsLocalized ? language : undefined} dir={uiLanguageDirection(language)}><WorkspaceHeader eyebrow={ui(eyebrow)} title={ui(title) ?? title} description={ui(description)} /></div>}
        form={resolvedForm}
        preview={preview}
        settings={settings}
        footer={footer}
        stickyFooter={stickyFooter}
      />
    </div>
  );
}
