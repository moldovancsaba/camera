'use client';

import { GdsStack } from '@sovereignsquad/gds-core/client';
import WorkspaceHeader from '@/components/admin/WorkspaceHeader';
import ExperienceTemplateDefaultSettings from '@/components/admin/ExperienceTemplateDefaultSettings';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminShellText } from '@/lib/i18n/admin-shell';

export default function GlobalExperienceDefaultsView() {
  const language = useUiLanguage();
  return (
    <GdsStack gap="lg">
      <WorkspaceHeader eyebrow={adminShellText('Content', language)} title={adminShellText('Global User Journey', language)} />
      <ExperienceTemplateDefaultSettings level="global" sectionTitle="Global User Journey" />
    </GdsStack>
  );
}
