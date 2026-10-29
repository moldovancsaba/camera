'use client';

import { useEffect, useState } from 'react';
import { AdminSelect, AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate } from '@/lib/visual-assets/contracts';

type Level = 'global' | 'partner';
type StoredChoice = string | null | 'inherit';
interface Data { templateId: StoredChoice; templates: ExperienceTemplate[] }
interface Props {
  level: Level;
  /** Partner's Mongo id, used only in the scoped API URL. */
  resourceId?: string;
  /** Save a reusable snapshot from this event when the user can manage it. */
  sourceEventId?: string;
  canManage?: boolean;
}

function apiData<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid response.');
  const data = (payload as { data?: T }).data;
  if (!data) throw new Error((payload as { error?: string }).error || 'The server returned an invalid response.');
  return data;
}

export default function ExperienceTemplateDefaultSettings({ level, resourceId, sourceEventId, canManage = false }: Props) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const endpoint = level === 'global' ? '/api/visual-assets/templates/default' : `/api/partners/${encodeURIComponent(resourceId ?? '')}/experience-template`;
  const [data, setData] = useState<Data | null>(null);
  const [choice, setChoice] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
    const next = apiData<Data>(payload);
    setData(next);
    setChoice(next.templateId === 'inherit' ? 'inherit' : next.templateId === null ? (level === 'partner' ? 'disabled' : '') : next.templateId);
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load experience settings.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // `endpoint` is a stable string for this component's owner and scope.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, level]);

  const options = [
    ...(level === 'partner' ? [
      { value: 'inherit', label: ui('Follow the parent default') },
      { value: 'disabled', label: ui('Disable inherited experience') },
    ] : [
      { value: '', label: ui('Disable inherited experience') },
    ]),
    ...(data?.templates ?? []).map((template) => ({ value: template.templateId, label: template.name })),
  ];

  const dirty = Boolean(data && choice !== (data.templateId === 'inherit' ? 'inherit' : data.templateId === null ? (level === 'partner' ? 'disabled' : '') : data.templateId));

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const templateId = level === 'global'
        ? (choice || null)
        : choice === 'inherit' ? 'inherit' : choice === 'disabled' ? null : choice;
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ templateId: StoredChoice }>(payload);
      setData((current) => current ? { ...current, templateId: result.templateId } : current);
      setChoice(result.templateId === 'inherit' ? 'inherit' : result.templateId === null ? (level === 'partner' ? 'disabled' : '') : result.templateId);
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the experience choice.');
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    if (!sourceEventId || !templateName.trim()) return;
    setCreating(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch('/api/visual-assets/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, name: templateName.trim(), sourceEventId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      setData((current) => current ? { ...current, templates: [result.template, ...current.templates] } : { templateId: level === 'partner' ? 'inherit' : null, templates: [result.template] });
      setChoice(result.template.templateId);
      setTemplateName('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the template.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <StateBlock variant="loading" title={ui('Loading experience settings')} />;

  return (
    <SectionPanel title={ui('Experience defaults')} description={ui('Choose the reusable guest experience at this level. Child levels follow it until they choose their own.')}>
      <GdsStack gap="md">
        {error ? <InlineAlert title={ui('Experience defaults')} message={error} severity="error" /> : null}
        {saved && !dirty ? <InlineAlert title={ui('Saved.')} severity="info" /> : null}
        <GdsInline gap="md" align="end">
          <AdminSelect
            name={`${level}-experience-template`}
            label={ui('Experience defaults')}
            value={choice}
            onChange={(value) => { setChoice(value ?? ''); setSaved(false); }}
            data={options}
            allowDeselect={false}
            disabled={!data || saving || creating}
          />
          <SemanticButton action={`experience-template:${level}-save`} loading={saving} disabled={!data || saving || creating || !dirty} onClick={() => void save()}>
            {ui('Save choice')}
          </SemanticButton>
        </GdsInline>
        {level === 'partner' && choice === 'inherit' ? <p>{ui('This level follows its parent.')}</p> : null}
        {level === 'partner' && choice === 'disabled' ? <p>{ui('This level has no inherited experience.')}</p> : null}
        {data?.templates.length === 0 ? <MetadataText>{ui('No templates yet')}</MetadataText> : null}
        {canManage && sourceEventId ? (
          <GdsStack gap="sm">
            <MetadataText>{ui('Save the current setup as a reusable template.')}</MetadataText>
            <GdsInline gap="md" align="end">
              <AdminTextInput name={`${level}-template-name`} label={ui('Template name')} value={templateName} onChange={setTemplateName} maxLength={120} />
              <SemanticButton action={`experience-template:${level}-create`} loading={creating} disabled={creating || saving || !templateName.trim()} onClick={() => void create()}>
                {ui('Create template from this event')}
              </SemanticButton>
            </GdsInline>
          </GdsStack>
        ) : null}
      </GdsStack>
    </SectionPanel>
  );
}
