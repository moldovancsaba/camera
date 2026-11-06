'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, StateBlock } from '@sovereignsquad/gds-core/client';
import { Anchor } from '@/components/gds/PublicPrimitives';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import ExperienceJourneyList, { type ExperienceJourneyListRow } from '@/components/admin/ExperienceJourneyList';
import ExperienceTemplatePageEditor from '@/components/admin/ExperienceTemplatePageEditor';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate, ExperienceTemplateSelection } from '@/lib/visual-assets/contracts';
import type { EventThemePreview } from '@/lib/theme/event-theme';
import type { JourneyContext } from '@/lib/events/journey';
import type { EffectiveCheckboxes, StoredCheckboxSettings } from '@/lib/events/checkbox-settings';

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

export default function EventExperienceTemplateSettings({ eventMongoId, sourceEventId, eventWelcomeScreenUrl, eventTheme, journeyContext, acceptanceOnWhoAreYou, galleryConsent, consentSettings, partnerCheckboxes, onSelectionChanged }: {
  eventMongoId: string;
  sourceEventId: string;
  eventWelcomeScreenUrl?: string;
  eventTheme?: EventThemePreview;
  journeyContext?: JourneyContext;
  acceptanceOnWhoAreYou?: boolean | null;
  galleryConsent?: boolean | null;
  consentSettings?: StoredCheckboxSettings | null;
  partnerCheckboxes?: EffectiveCheckboxes;
  onSelectionChanged?: () => Promise<void> | void;
}) {
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
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not select this event journey.'); }
    finally { setSaving(false); }
  };

  const create = async ({ makeDefault = false, openEditor = false, journeyName = name }: { makeDefault?: boolean; openEditor?: boolean; journeyName?: string } = {}) => {
    if (!journeyName.trim()) return;
    setCreating(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/visual-assets/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'event', name: journeyName.trim(), sourceEventId, ...(makeDefault ? { makeDefault: true } : {}) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      setState((current) => current ? { ...current, templates: [result.template, ...current.templates] } : current);
      if (makeDefault) await fetchState();
      if (openEditor) setEditingId(result.template.templateId);
      else setName('');
      setNotice(openEditor
        ? ui(state?.legacyJourney
          ? 'Journey version created and selected as this level’s default.'
          : 'Inherited journey customized. This event now owns the selected copy.')
        : ui('Journey version created. Select it below to make it live.'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create this event journey.'); }
    finally { setCreating(false); }
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
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not rename this journey.'); }
    finally { setSavingId(null); }
  };

  const remove = async (template: ExperienceTemplate) => {
    setSavingId(template.templateId); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      setState((current) => current ? { ...current, templates: current.templates.filter((item) => item.templateId !== template.templateId) } : current);
      setDeleteId(null); if (editingId === template.templateId) setEditingId(null); setNotice(ui('Journey deleted.'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete this journey.'); }
    finally { setSavingId(null); }
  };

  if (loading) return <StateBlock variant="loading" title={ui('Loading experience settings')} />;

  const rows: ExperienceJourneyListRow[] = [
    ...(state?.legacyJourney ? [{ id: 'legacy', value: 'legacy', name: ui('Existing event setup'), detail: ui('Currently live'), selected: true, canSelect: false }] : []),
    ...(!state?.legacyJourney ? [{
      id: 'inherit', value: 'inherit', name: state?.inheritedJourney?.name || ui('Inherited parent journey'),
      detail: ui('Use the partner default; if the partner has not selected one, use the global default.'),
      selected: choice === 'inherit', canSelect: Boolean(state?.inheritedJourney) || choice === 'inherit',
      canCustomize: Boolean(state?.canCreateEventTemplate && state?.inheritedJourney),
    }] : []),
    ...(state?.templates ?? []).map((template) => ({
      id: template.templateId, value: template.templateId, name: template.name,
      detail: ui('Event journey'), selected: choice === template.templateId && !state?.legacyJourney,
      busy: savingId === template.templateId || creating,
      canEdit: state?.canCreateEventTemplate, canRename: state?.canCreateEventTemplate,
      canDelete: state?.canCreateEventTemplate && choice !== template.templateId,
    })),
  ];
  const liveJourneyName = state?.legacyJourney ? ui('Existing event setup')
    : choice === 'inherit' ? state?.inheritedJourney?.name ?? ui('No journey resolved')
      : state?.templates.find((item) => item.templateId === choice)?.name ?? ui('No journey resolved');

  if (editingId) {
    const editingTemplate = state?.templates.find((template) => template.templateId === editingId);
    if (editingTemplate) return (
      <GdsStack gap="md" className="experience-journey-editor" style={{ width: '100%', maxWidth: 'none', minWidth: 0 }}>
        <GdsInline justify="between" align="center">
          <MetadataText>{ui('Event User Journey')} · {editingTemplate.name}</MetadataText>
          <SemanticButton action="event-journey:close-editor" onClick={() => setEditingId(null)} />
        </GdsInline>
        {choice === editingTemplate.templateId ? <InlineAlert title={ui('Live guest flow')} message={ui('Saving edits to this selected journey updates the live guest flow for this event.')} severity="warning" /> : null}
        <ExperienceTemplatePageEditor
          template={editingTemplate}
          pickerLevel={{ scope: 'event', eventId: eventMongoId }}
          eventId={eventMongoId}
          eventWelcomeScreenUrl={eventWelcomeScreenUrl}
          eventTheme={eventTheme}
          journeyContext={journeyContext}
          acceptanceOnWhoAreYou={acceptanceOnWhoAreYou}
          galleryConsent={galleryConsent}
          consentSettings={consentSettings}
          partnerCheckboxes={partnerCheckboxes}
          onSaved={(updated) => setState((current) => current ? { ...current, templates: current.templates.map((item) => item.templateId === updated.templateId ? updated : item) } : current)}
        />
      </GdsStack>
    );
  }

  return (
    <GdsStack gap="md" className="experience-journey-manager" style={{ width: '100%', maxWidth: 'none', minWidth: 0 }}>
      {error ? <InlineAlert title={ui('Journey settings')} message={error} severity="error" /> : null}
      {notice ? <InlineAlert title={ui('Saved.')} message={notice} severity="info" /> : null}
      {state?.selectionNeedsRepair ? <InlineAlert title={ui('Journey selection repaired')} message={ui('The saved Event Journey no longer exists. The event is currently using its parent default; save that choice or select an available event journey.')} severity="warning" /> : null}
      <GdsStack gap="sm">
        <MetadataText>{ui('Currently live')}: {liveJourneyName}</MetadataText>
        {state?.publicLinks.captureUrl || state?.publicLinks.shortUrl ? <GdsStack gap="xs">
          <MetadataText>{ui('Public event links')}</MetadataText>
          {state.publicLinks.captureUrl ? <Anchor href={state.publicLinks.captureUrl} target="_blank" rel="noreferrer">{ui('Open capture journey')} · {state.publicLinks.captureUrl}</Anchor> : null}
          {state.publicLinks.shortUrl ? <Anchor href={state.publicLinks.shortUrl} target="_blank" rel="noreferrer">{ui('Short link')} · {state.publicLinks.shortUrl}</Anchor> : null}
        </GdsStack> : null}
      </GdsStack>
      {state?.legacyJourney ? <InlineAlert title={ui('Existing event setup')} message={ui('These saved pages remain live until you save them as a named Event Journey or choose another journey.')} severity="warning" /> : null}
      {!state?.legacyJourney && choice === 'inherit' ? <InlineAlert title={ui('Inherited journey editing')} message={ui('Editing an inherited journey creates and selects a separate Event Journey. Parent changes will not modify that event-owned journey.')} severity="info" /> : null}

      <ExperienceJourneyList
        title={ui('Event User Journey')}
        description={ui('Choose which single journey is used by this event’s capture URL, short link, and QR codes.')}
        groupName="event-journey-default"
        actionNamespace="event-journey"
        rows={rows}
        canManage={Boolean(state?.canCreateEventTemplate)}
        saving={saving || creating || Boolean(savingId)}
        renameId={renameId}
        renameValue={renameValue}
        deleteId={deleteId}
        onSelect={(value) => { if (value === 'inherit') void selectJourney({ mode: 'inherit' }); else if (value !== 'legacy') void selectJourney({ mode: 'template', templateId: value }); }}
        onEdit={setEditingId}
        onRenameStart={(id, currentName) => { setRenameId(id); setRenameValue(currentName); }}
        onRenameChange={setRenameValue}
        onRenameSave={(id) => { const template = state?.templates.find((item) => item.templateId === id); if (template) void rename(template); }}
        onRenameCancel={() => setRenameId(null)}
        onDeleteStart={setDeleteId}
        onDeleteConfirm={(id) => { const template = state?.templates.find((item) => item.templateId === id); if (template) void remove(template); }}
        onDeleteCancel={() => setDeleteId(null)}
        onCustomize={() => { if (name.trim()) void create({ makeDefault: true, openEditor: true }); }}
        emptyMessage={ui('No event journeys yet.')}
        createForm={state?.canCreateEventTemplate ? <GdsStack gap="sm">
          <MetadataText>{ui('Create journey version')}</MetadataText>
          <GdsInline gap="md" align="end">
            <AdminTextInput name="event-journey-new-name" label={ui('Journey name')} value={name} onChange={setName} maxLength={120} />
            <SemanticButton action="experience-template:event-create" loading={creating} disabled={creating || !name.trim()} onClick={() => void create(state.legacyJourney ? { makeDefault: true, openEditor: true } : {})}>{state.legacyJourney ? ui('Save and edit journey') : ui('Create journey')}</SemanticButton>
          </GdsInline>
        </GdsStack> : null}
      />
    </GdsStack>
  );
}
