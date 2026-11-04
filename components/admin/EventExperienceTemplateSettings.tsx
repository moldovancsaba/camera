'use client';

import { useEffect, useState } from 'react';
import { AdminSelect } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import { Anchor } from '@/components/gds/PublicPrimitives';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import ExperienceTemplateCreator from '@/components/admin/ExperienceTemplateCreator';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate, ExperienceTemplateSelection } from '@/lib/visual-assets/contracts';

interface JourneyRef {
  templateId: string;
  name: string | null;
  level: 'global' | 'partner' | 'event' | null;
}

interface State {
  selection: ExperienceTemplateSelection | null;
  effectiveJourney: JourneyRef | null;
  inheritedJourney: JourneyRef | null;
  publicLinks: { captureUrl: string; shortUrl: string | null };
  templates: ExperienceTemplate[];
  canCreateTemplateLevels: Array<'global' | 'partner' | 'event'>;
}

function apiData<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid response.');
  const data = (payload as { data?: T }).data;
  if (!data) throw new Error((payload as { error?: string }).error || 'The server returned an invalid response.');
  return data;
}

function optionOf(selection: ExperienceTemplateSelection | null, effectiveTemplateId: string | null): string {
  if (!selection) return effectiveTemplateId ? 'inherit' : 'disabled';
  if (selection.mode === 'inherit') return 'inherit';
  return selection.templateId ?? 'disabled';
}

function selectionOf(option: string): ExperienceTemplateSelection {
  if (option === 'inherit') return { mode: 'inherit' };
  if (option === 'disabled') return { mode: 'template', templateId: null };
  return { mode: 'template', templateId: option };
}

export default function EventExperienceTemplateSettings({ eventMongoId, sourceEventId }: { eventMongoId: string; sourceEventId: string }) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const endpoint = `/api/events/${encodeURIComponent(eventMongoId)}/experience-template`;
  const [state, setState] = useState<State | null>(null);
  const [choice, setChoice] = useState('disabled');
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
      .then((next) => { setState(next); setChoice(optionOf(next.selection, next.effectiveJourney?.templateId ?? null)); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load experience settings.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint]);

  const options = [
    {
      value: 'inherit',
      label: state?.inheritedJourney?.name
        ? `${ui('Follow the parent default')} — ${state.inheritedJourney.name}`
        : ui('Follow the parent default'),
    },
    { value: 'disabled', label: ui('Use this event’s own pages') },
    ...(state?.templates ?? []).map((template) => ({ value: template.templateId, label: template.name })),
  ];
  const currentChoice = state ? optionOf(state.selection, state.effectiveJourney?.templateId ?? null) : 'disabled';
  const dirty = Boolean(state && choice !== currentChoice);

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
      const result = apiData<{ selection: ExperienceTemplateSelection }>(payload);
      const selectedTemplate = state.templates.find((template) => template.templateId === choice);
      const effectiveJourney = choice === 'inherit'
        ? state.inheritedJourney
        : selectedTemplate
          ? { templateId: selectedTemplate.templateId, name: selectedTemplate.name, level: selectedTemplate.level }
          : null;
      setState((current) => current ? { ...current, selection: result.selection, effectiveJourney } : current);
      setChoice(optionOf(result.selection, effectiveJourney?.templateId ?? null));
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
      <SectionPanel
        title={ui('Journey shown to event guests')}
        description={ui('This choice controls the journey opened by this event’s capture URL, short link and QR codes.')}
      >
        <GdsStack gap="md">
          {error ? <InlineAlert title={ui('Experience defaults')} message={error} severity="error" /> : null}
          {saved ? <InlineAlert title={ui('Saved.')} message={ui('The public event links now use this journey.')} severity="info" /> : null}
          <MetadataText>
            {ui('Currently live')}: {state?.effectiveJourney?.name ?? ui('This event’s own pages')}
          </MetadataText>
          <GdsInline gap="md" align="end">
            <AdminSelect
              name="event-public-experience-template"
              label={ui('Journey shown to event guests')}
              value={choice}
              onChange={(value) => { setChoice(value ?? 'disabled'); setSaved(false); }}
              data={options}
              allowDeselect={false}
              disabled={!state || saving}
            />
            <SemanticButton action="experience-template:event-save" loading={saving} disabled={!state || saving || !dirty} onClick={() => void save()}>
              {ui('Save choice')}
            </SemanticButton>
          </GdsInline>
          <GdsStack gap="xs">
            <MetadataText>{ui('Public event links')}</MetadataText>
            {state?.publicLinks.captureUrl ? <Anchor href={state.publicLinks.captureUrl} target="_blank" rel="noreferrer">{ui('Open capture journey')} · {state.publicLinks.captureUrl}</Anchor> : null}
            {state?.publicLinks.shortUrl ? <Anchor href={state.publicLinks.shortUrl} target="_blank" rel="noreferrer">{ui('Short link')} · {state.publicLinks.shortUrl}</Anchor> : null}
          </GdsStack>
        </GdsStack>
      </SectionPanel>
      {state?.canCreateTemplateLevels.map((level) => (
        <ExperienceTemplateCreator
          key={level}
          level={level}
          sourceEventId={sourceEventId}
          onCreated={(template) => {
            if (template.level !== 'event') return;
            setState((current) => current ? {
              ...current,
              templates: [template, ...current.templates.filter((item) => item.templateId !== template.templateId)],
            } : current);
          }}
        />
      ))}
    </GdsStack>
  );
}
