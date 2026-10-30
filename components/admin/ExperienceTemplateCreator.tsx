'use client';

import { useState } from 'react';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, SectionPanel } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate } from '@/lib/visual-assets/contracts';

type Level = 'global' | 'partner' | 'event';

export default function ExperienceTemplateCreator({ level, sourceEventId }: { level: Level; sourceEventId: string }) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ExperienceTemplate | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const response = await fetch('/api/visual-assets/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, name: name.trim(), sourceEventId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const data = (payload as { data?: { template?: ExperienceTemplate } } | null)?.data;
      if (!data?.template) throw new Error('The server did not return the new template.');
      setCreated(data.template);
      setName('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the template.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionPanel title={ui('Experience defaults')} description={ui('Save the current setup as a reusable template.')}>
      <GdsStack gap="md">
        {error ? <InlineAlert title={ui('Experience defaults')} message={error} severity="error" /> : null}
        {created ? <InlineAlert title={ui('Saved.')} message={created.name} severity="info" /> : null}
        <MetadataText>{ui('Save the current setup as a reusable template.')}</MetadataText>
        <GdsInline gap="md" align="end">
          <AdminTextInput name={`${level}-experience-template-name`} label={ui('Template name')} value={name} onChange={setName} maxLength={120} />
          <SemanticButton action={`experience-template:${level}-create`} loading={busy} disabled={busy || !name.trim()} onClick={() => void create()}>
            {ui('Create template from this event')}
          </SemanticButton>
        </GdsInline>
      </GdsStack>
    </SectionPanel>
  );
}
