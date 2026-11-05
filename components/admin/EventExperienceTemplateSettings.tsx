'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import { Anchor } from '@/components/gds/PublicPrimitives';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import ExperienceTemplatePageEditor from '@/components/admin/ExperienceTemplatePageEditor';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate, ExperienceTemplateSelection } from '@/lib/visual-assets/contracts';

interface JourneyRef { templateId: string; name: string | null; level: 'global' | 'partner' | 'event' | null }
interface State {
  selection: ExperienceTemplateSelection | null;
  effectiveJourney: JourneyRef | null;
  inheritedJourney: JourneyRef | null;
  legacyJourney: boolean;
  selectionNeedsRepair: boolean;
  publicLinks: { captureUrl: string; shortUrl: string | null };
  templates: ExperienceTemplate[];
  canCreateEventTemplate: boolean;
}

function apiData<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid response.');
  const data = (payload as { data?: T }).data;
  if (!data) throw new Error((payload as { error?: string }).error || 'The server returned an invalid response.');
  return data;
}

export default function EventExperienceTemplateSettings({ eventMongoId, sourceEventId, onSelectionChanged }: { eventMongoId: string; sourceEventId: string; onSelectionChanged?: () => Promise<void> | void }) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const endpoint = `/api/events/${encodeURIComponent(eventMongoId)}/experience-template`;
  const [state, setState] = useState<State | null>(null);
  const [choice, setChoice] = useState('legacy');
  const [name, setName] = useState('Event journey');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchState = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
    const next = apiData<State>(payload);
    setState(next);
    setChoice(next.legacyJourney ? 'legacy' : next.selection?.mode === 'template' ? next.selection.templateId ?? 'inherit' : 'inherit');
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchState(controller.signal)
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load experience settings.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fetchState]);

  const selectJourney = async (selection: ExperienceTemplateSelection) => {
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selection }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ selection: ExperienceTemplateSelection }>(payload);
      setState((current) => current ? { ...current, selection: result.selection, legacyJourney: false, selectionNeedsRepair: false } : current);
      setChoice(result.selection.mode === 'template' ? result.selection.templateId ?? 'inherit' : 'inherit');
      await fetchState();
      await onSelectionChanged?.();
      setNotice(ui('Journey default saved.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not select this event journey.');
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/visual-assets/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'event', name: name.trim(), sourceEventId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      setState((current) => current ? { ...current, templates: [result.template, ...current.templates] } : current);
      setName('');
      setNotice(ui('Journey version created. Select it below to make it live.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create this event journey.');
    } finally {
      setCreating(false);
    }
  };

  const rename = async (template: ExperienceTemplate) => {
    if (!renameValue.trim()) return;
    setSavingId(template.templateId); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renameValue.trim() }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      setState((current) => current ? { ...current, templates: current.templates.map((item) => item.templateId === template.templateId ? result.template : item) } : current);
      setRenameId(null); setNotice(ui('Journey renamed.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not rename this journey.');
    } finally { setSavingId(null); }
  };

  const remove = async (template: ExperienceTemplate) => {
    setSavingId(template.templateId); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      setState((current) => current ? { ...current, templates: current.templates.filter((item) => item.templateId !== template.templateId) } : current);
      setDeleteId(null); setNotice(ui('Journey deleted.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete this journey.');
    } finally { setSavingId(null); }
  };

  if (loading) return <StateBlock variant="loading" title={ui('Loading experience settings')} />;

  return (
    <GdsStack gap="lg">
      {error ? <InlineAlert title={ui('Journey settings')} message={error} severity="error" /> : null}
      {notice ? <InlineAlert title={ui('Saved.')} message={notice} severity="info" /> : null}
      <SectionPanel title={ui('Journey shown to event guests')} description={ui('The selected Event Journey controls this event’s capture URL, short link, and QR codes.') }>
        <GdsStack gap="md">
          <MetadataText>{ui('Currently live')}: {state?.legacyJourney ? ui('Existing event pages') : choice === 'inherit' ? state?.inheritedJourney?.name ?? ui('Inherited parent journey') : state?.templates.find((item) => item.templateId === choice)?.name ?? ui('No journey resolved')}</MetadataText>
          {choice === 'inherit' && !state?.legacyJourney ? <InlineAlert title={ui('Inherited journey editing')} message={ui('Editing the event pages below creates and selects a separate Event Journey from this inherited flow. Later parent changes will not change that event journey.') } severity="info" /> : null}
          {state?.legacyJourney ? <InlineAlert title={ui('Existing event setup')} message={ui('This event has saved pages from before named journeys. They remain live until you select another journey. Create a named Event Journey from this setup, then select it below.') } severity="warning" /> : null}
      {state?.selectionNeedsRepair ? <InlineAlert title={ui('Journey selection repaired')} message={ui('The saved Event Journey no longer exists. The event is currently using its parent default; save that choice or select an available event journey.') } severity="warning" /> : null}
          <GdsStack gap="xs">
            <MetadataText>{ui('Public event links')}</MetadataText>
            {state?.publicLinks.captureUrl ? <Anchor href={state.publicLinks.captureUrl} target="_blank" rel="noreferrer">{ui('Open capture journey')} · {state.publicLinks.captureUrl}</Anchor> : null}
            {state?.publicLinks.shortUrl ? <Anchor href={state.publicLinks.shortUrl} target="_blank" rel="noreferrer">{ui('Short link')} · {state.publicLinks.shortUrl}</Anchor> : null}
          </GdsStack>
        </GdsStack>
      </SectionPanel>

      <SectionPanel title={ui('Event journey versions')} description={ui('An event inherits exactly one partner default until an Event Journey is selected here.') }>
        <GdsStack gap="md">
          <SectionPanel title={ui('Inherited parent journey')} description={ui('Use the partner default; if the partner has not selected one, use the global default.') }>
            <GdsInline gap="sm" align="center">
              <MetadataText>{state?.inheritedJourney?.name ?? ui('No parent journey is currently available.')}</MetadataText>
              <SemanticButton action="experience-template:event-inherit" loading={saving} disabled={saving || state?.legacyJourney === true || (choice === 'inherit' && !state?.selectionNeedsRepair)} onClick={() => void selectJourney({ mode: 'inherit' })}>{ui('Use parent default')}</SemanticButton>
            </GdsInline>
            {state?.legacyJourney ? <MetadataText>{ui('Create a named Event Journey first to preserve these existing pages before switching to the parent default.')}</MetadataText> : null}
          </SectionPanel>
          {state?.templates.map((template) => {
            const selected = choice === template.templateId && !state.legacyJourney;
            const busy = savingId === template.templateId || creating;
            return <SectionPanel key={template.templateId} title={template.name} description={`${ui('Event journey')} · ${template.templateId}`}>
              <GdsStack gap="sm">
                <GdsInline gap="sm" align="center">
                  <MetadataText>{selected ? ui('Selected for event guests') : ui('Available journey')}</MetadataText>
                  {!selected ? <SemanticButton action="event-journey:select" loading={saving} disabled={saving || creating} onClick={() => void selectJourney({ mode: 'template', templateId: template.templateId })}>{ui('Use for this event')}</SemanticButton> : null}
                  {state.canCreateEventTemplate && !renameId ? <SemanticButton action="event-journey:rename" disabled={busy} onClick={() => { setRenameId(template.templateId); setRenameValue(template.name); }}>{ui('Rename')}</SemanticButton> : null}
                  {state.canCreateEventTemplate && deleteId !== template.templateId ? <SemanticButton action="event-journey:delete" disabled={busy || selected} onClick={() => setDeleteId(template.templateId)}>{ui('Delete')}</SemanticButton> : null}
                  {state.canCreateEventTemplate ? <SemanticButton action={editingId === template.templateId ? 'event-journey:close-editor' : 'event-journey:edit'} disabled={busy} onClick={() => setEditingId(editingId === template.templateId ? null : template.templateId)}>{editingId === template.templateId ? ui('Close editor') : ui('Edit journey')}</SemanticButton> : null}
                </GdsInline>
                {renameId === template.templateId ? <GdsInline gap="sm" align="end">
                  <AdminTextInput name={`event-journey-name-${template.templateId}`} label={ui('Journey name')} value={renameValue} onChange={setRenameValue} maxLength={120} />
                  <SemanticButton action="event-journey:save-name" loading={busy} disabled={busy || !renameValue.trim()} onClick={() => void rename(template)}>{ui('Save name')}</SemanticButton>
                  <SemanticButton action="event-journey:cancel-name" disabled={busy} onClick={() => setRenameId(null)}>{ui('Cancel')}</SemanticButton>
                </GdsInline> : null}
                {deleteId === template.templateId ? <>
                  <InlineAlert title={ui('Confirm deletion')} message={ui('This journey can only be deleted after all events stop using it.')} severity="warning" />
                  <GdsInline gap="sm">
                    <SemanticButton action="event-journey:confirm-delete" loading={busy} disabled={busy} onClick={() => void remove(template)}>{ui('Confirm delete')}</SemanticButton>
                    <SemanticButton action="event-journey:cancel-delete" disabled={busy} onClick={() => setDeleteId(null)}>{ui('Cancel')}</SemanticButton>
                  </GdsInline>
                </> : null}
                {editingId === template.templateId && selected ? <InlineAlert title={ui('Live guest flow')} message={ui('Saving edits to this selected journey updates the live guest flow, including children that still follow it.')} severity="warning" /> : null}
                {editingId === template.templateId ? <ExperienceTemplatePageEditor template={template} onSaved={(updated) => setState((current) => current ? { ...current, templates: current.templates.map((item) => item.templateId === updated.templateId ? updated : item) } : current)} /> : null}
              </GdsStack>
            </SectionPanel>;
          })}
          {state?.templates.length === 0 ? <MetadataText>{ui('No event journeys yet.')}</MetadataText> : null}
        </GdsStack>
      </SectionPanel>

      {state?.canCreateEventTemplate ? <SectionPanel title={ui('Create Event Journey')} description={ui('Save the current event setup as a named journey. It becomes live only when selected above.') }>
        <GdsInline gap="md" align="end">
          <AdminTextInput name="event-journey-new-name" label={ui('Journey name')} value={name} onChange={setName} maxLength={120} />
          <SemanticButton action="experience-template:event-create" loading={creating} disabled={creating || !name.trim()} onClick={() => void create()}>{ui('Create journey')}</SemanticButton>
        </GdsInline>
      </SectionPanel> : null}
    </GdsStack>
  );
}
