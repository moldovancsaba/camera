'use client';

import { useEffect, useState } from 'react';
import { AdminSelect } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import ExperienceTemplateCreator from '@/components/admin/ExperienceTemplateCreator';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate, ExperienceTemplateSelection } from '@/lib/visual-assets/contracts';

interface State {
  selection: ExperienceTemplateSelection | null;
  templates: ExperienceTemplate[];
  canCreateTemplateLevels: Array<'global' | 'partner' | 'event'>;
}

function apiData<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid response.');
  const data = (payload as { data?: T }).data;
  if (!data) throw new Error((payload as { error?: string }).error || 'The server returned an invalid response.');
  return data;
}

function optionOf(selection: ExperienceTemplateSelection | null): string {
  if (!selection) return 'legacy';
  if (selection.mode === 'inherit') return 'inherit';
  return selection.templateId ?? 'disabled';
}

function selectionOf(option: string): ExperienceTemplateSelection | null {
  if (option === 'legacy') return null;
  if (option === 'inherit') return { mode: 'inherit' };
  if (option === 'disabled') return { mode: 'template', templateId: null };
  return { mode: 'template', templateId: option };
}

export default function EventExperienceTemplateSettings({ eventMongoId, sourceEventId }: { eventMongoId: string; sourceEventId: string }) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const endpoint = `/api/events/${encodeURIComponent(eventMongoId)}/experience-template`;
  const [state, setState] = useState<State | null>(null);
  const [choice, setChoice] = useState('legacy');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
        return apiData<State>(payload);
      })
      .then((next) => { setState(next); setChoice(optionOf(next.selection)); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load experience settings.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint]);

  const options = [
    { value: 'legacy', label: ui("Keep this event's current setup") },
    { value: 'inherit', label: ui('Follow the parent default') },
    { value: 'disabled', label: ui('Disable inherited experience') },
    ...(state?.templates ?? []).map((template) => ({ value: template.templateId, label: template.name })),
  ];
  const dirty = Boolean(state && choice !== optionOf(state.selection));

  const save = async () => {
    if (!state) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const selection = selectionOf(choice);
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selection }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ selection: ExperienceTemplateSelection | null }>(payload);
      setState((current) => current ? { ...current, selection: result.selection } : current);
      setChoice(optionOf(result.selection));
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the experience choice.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <StateBlock variant="loading" title={ui('Loading experience settings')} />;

  return (
    <GdsStack gap="lg">
      <SectionPanel title={ui('Experience defaults')} description={ui('Choose the reusable guest experience at this level. Child levels follow it until they choose their own.')}>
        <GdsStack gap="md">
          {error ? <InlineAlert title={ui('Experience defaults')} message={error} severity="error" /> : null}
          {saved && !dirty ? <InlineAlert title={ui('Saved.')} severity="info" /> : null}
          <GdsInline gap="md" align="end">
            <AdminSelect name="event-experience-template" label={ui('Experience defaults')} value={choice} onChange={(value) => { setChoice(value ?? 'legacy'); setSaved(false); }} data={options} allowDeselect={false} disabled={!state || saving} />
            <SemanticButton action="experience-template:event-save" loading={saving} disabled={!state || saving || !dirty} onClick={() => void save()}>
              {ui('Save choice')}
            </SemanticButton>
          </GdsInline>
          <MetadataText>{choice === 'legacy' ? ui("Keep this event's current setup") : choice === 'inherit' ? ui('This level follows its parent.') : choice === 'disabled' ? ui('This level has no inherited experience.') : ''}</MetadataText>
          {state?.templates.length === 0 ? <MetadataText>{ui('No templates yet')}</MetadataText> : null}
        </GdsStack>
      </SectionPanel>
      {state?.canCreateTemplateLevels.map((level) => (
        <ExperienceTemplateCreator key={level} level={level} sourceEventId={sourceEventId} />
      ))}
    </GdsStack>
  );
}
