'use client';

import { useEffect, useState } from 'react';
import { AdminSelect, AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import ExperienceJourneyList, { type ExperienceJourneyListRow } from '@/components/admin/ExperienceJourneyList';
import ExperienceTemplatePageEditor from '@/components/admin/ExperienceTemplatePageEditor';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate } from '@/lib/visual-assets/contracts';

type Level = 'global' | 'partner';
type StoredChoice = string | 'inherit' | null;
interface SourceEvent { _id: string; eventId?: string; name?: string; partnerName?: string; eventDate?: string; isActive?: boolean }
interface Data {
  templateId: StoredChoice;
  templates: ExperienceTemplate[];
  globalTemplates?: ExperienceTemplate[];
  sourceEvents?: SourceEvent[];
  testEvents?: SourceEvent[];
  globalTemplateId?: string | null;
  globalTemplateName?: string | null;
  selectionNeedsRepair?: boolean;
}
interface Props {
  level: Level;
  resourceId?: string;
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
  const [choice, setChoice] = useState<StoredChoice>(level === 'partner' ? 'inherit' : null);
  const [templateName, setTemplateName] = useState(level === 'global' ? 'Global journey' : 'Partner journey');
  const [sourceChoice, setSourceChoice] = useState('');
  const [testEventId, setTestEventId] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (signal?: AbortSignal) => {
    const response = await fetch(endpoint, { signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
    const next = apiData<Data>(payload);
    setData(next);
    setChoice(level === 'partner' && typeof next.templateId !== 'string' ? 'inherit' : next.templateId);
    const testEvents = next.testEvents ?? [];
    setTestEventId((current) => current && testEvents.some((event) => event._id === current) ? current : testEvents[0]?._id ?? '');
    const choices = level === 'global'
      ? [
        ...(next.templates ?? []).map((template) => `template:${template.templateId}`),
        ...(next.sourceEvents ?? []).map((event) => event._id),
      ]
      : [
        ...(next.globalTemplates ?? []).map((template) => `template:${template.templateId}`),
        ...(next.templates ?? []).map((template) => `template:${template.templateId}`),
        ...(next.sourceEvents ?? []).map((event) => `event:${event._id}`),
      ];
    setSourceChoice((current) => {
      if (current && choices.includes(current)) return current;
      const selected = level === 'global' ? next.templateId : next.globalTemplateId;
      if (typeof selected === 'string' && choices.includes(`template:${selected}`)) return `template:${selected}`;
      if (level === 'global') return next.templates?.[0]?.templateId ? `template:${next.templates[0].templateId}` : next.sourceEvents?.[0]?._id ?? '';
      if (sourceEventId && choices.includes(`event:${sourceEventId}`)) return `event:${sourceEventId}`;
      const firstEvent = next.sourceEvents?.[0]?._id;
      if (firstEvent && choices.includes(`event:${firstEvent}`)) return `event:${firstEvent}`;
      return next.globalTemplates?.[0]?.templateId
        ? `template:${next.globalTemplates[0].templateId}`
        : next.templates?.[0]?.templateId ? `template:${next.templates[0].templateId}` : '';
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load experience settings.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // `endpoint` is stable for this component's owner and level.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, level]);

  const activeId = typeof choice === 'string' && choice !== 'inherit' ? choice : null;
  const saveDefault = async (templateId: string | 'inherit') => {
    setSavingId(templateId); setError(null); setNotice(null);
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ templateId: StoredChoice }>(payload);
      const nextChoice = level === 'partner' && typeof result.templateId !== 'string' ? 'inherit' : result.templateId;
      setChoice(nextChoice);
      setData((current) => current ? { ...current, templateId: result.templateId, selectionNeedsRepair: false } : current);
      setNotice(ui('Journey default saved.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this journey default.');
    } finally { setSavingId(null); }
  };

  const create = async ({ source = sourceChoice, name = templateName, makeDefault = false, openEditor = false }: { source?: string; name?: string; makeDefault?: boolean; openEditor?: boolean } = {}) => {
    if (!source || !name.trim()) return;
    const selectedSourceTemplateId = source.startsWith('template:') ? source.slice('template:'.length) : undefined;
    const selectedSourceEventId = level === 'global' ? (selectedSourceTemplateId ? undefined : source) : source.startsWith('event:') ? source.slice('event:'.length) : undefined;
    if (!selectedSourceTemplateId && !selectedSourceEventId) return;
    setCreating(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/visual-assets/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level, name: name.trim(), ...(makeDefault ? { makeDefault: true } : {}),
          ...(selectedSourceTemplateId ? { sourceTemplateId: selectedSourceTemplateId } : { sourceEventId: selectedSourceEventId }),
          ...(level === 'partner' ? { partnerMongoId: resourceId } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      const becomesGlobalDefault = level === 'global' && !data?.templateId;
      const selected = makeDefault || becomesGlobalDefault;
      setData((current) => current ? { ...current, templates: [result.template, ...current.templates], ...(selected ? { templateId: result.template.templateId, selectionNeedsRepair: false } : {}) } : { templateId: selected ? result.template.templateId : null, templates: [result.template] });
      if (selected) setChoice(result.template.templateId);
      if (level === 'global' || (makeDefault && level === 'partner')) await load();
      if (openEditor) setEditingId(result.template.templateId);
      else setTemplateName('');
      setNotice(openEditor
        ? ui(level === 'partner' ? 'Inherited journey customized. This partner now owns the selected copy.' : 'Journey version created and selected as this level’s default.')
        : selected ? ui('Journey version created and selected as this level’s default.') : ui('Journey version created.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the journey version.');
    } finally { setCreating(false); }
  };

  const rename = async (template: ExperienceTemplate) => {
    if (!renameValue.trim()) return;
    setSavingId(template.templateId); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renameValue.trim() }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      setData((current) => current ? { ...current, templates: current.templates.map((item) => item.templateId === template.templateId ? result.template : item) } : current);
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
      setData((current) => current ? { ...current, templates: current.templates.filter((item) => item.templateId !== template.templateId) } : current);
      if (editingId === template.templateId) setEditingId(null);
      setDeleteId(null); setNotice(ui('Journey deleted.'));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete this journey.'); }
    finally { setSavingId(null); }
  };

  const saveContent = (updated: ExperienceTemplate) => setData((current) => current ? { ...current, templates: current.templates.map((item) => item.templateId === updated.templateId ? updated : item) } : current);

  const testJourney = (templateId: string) => {
    if (!testEventId) return;
    // The signed grant pins this test to the selected parent journey and event.
    // Opening the capture URL directly would otherwise show the event's live journey.
    const url = `/api/experience-journey-test?eventId=${encodeURIComponent(testEventId)}&templateId=${encodeURIComponent(templateId)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <StateBlock variant="loading" title={ui('Loading experience settings')} />;

  const rows: ExperienceJourneyListRow[] = [
    ...(level === 'partner' ? [{
      id: 'inherit', value: 'inherit', name: data?.globalTemplateName || ui('Global default journey'),
      detail: ui('Following the global default'), selected: choice === 'inherit', canSelect: true,
      canCustomize: Boolean(canManage && data?.globalTemplateId),
      testTemplateId: data?.globalTemplateId ?? undefined,
    }] : []),
    ...(data?.templates ?? []).map((template) => ({
      id: template.templateId, value: template.templateId, name: template.name,
      detail: ui(level === 'global' ? 'Global journey' : 'Partner journey'),
      selected: activeId === template.templateId, busy: savingId === template.templateId || creating,
      canEdit: canManage, canRename: canManage, canDelete: canManage && activeId !== template.templateId,
      testTemplateId: template.templateId,
    })),
  ];

  const journeyName = ui('Journeys');
  const createSources = level === 'global'
    ? [
      ...(data?.templates ?? []).map((template) => ({ value: `template:${template.templateId}`, label: `${ui('Global journey')}: ${template.name}` })),
      ...(data?.sourceEvents ?? []).map((event) => ({ value: event._id, label: [event.name || event.eventId || event._id, event.partnerName, event.eventDate].filter(Boolean).join(' · ') })),
    ]
    : [
      ...(data?.globalTemplates ?? []).map((template) => ({ value: `template:${template.templateId}`, label: `${ui(template.templateId === data?.globalTemplateId ? 'Global default journey' : 'Global journey')}: ${template.name}` })),
      ...(data?.templates ?? []).map((template) => ({ value: `template:${template.templateId}`, label: `${ui('Partner journey')}: ${template.name}` })),
      ...(data?.sourceEvents ?? []).map((event) => ({ value: `event:${event._id}`, label: `${ui('Event setup')}: ${event.name || event.eventId || event._id}` })),
    ];

  if (editingId) {
    const editingTemplate = data?.templates.find((template) => template.templateId === editingId);
    if (editingTemplate) return (
      <GdsStack gap="md" className="experience-journey-editor" style={{ width: '100%', maxWidth: 'none', minWidth: 0 }}>
        <GdsInline justify="between" align="center">
          <MetadataText>{journeyName} · {editingTemplate.name}</MetadataText>
          <SemanticButton action="experience-template:close-editor" onClick={() => setEditingId(null)} />
        </GdsInline>
        {activeId === editingTemplate.templateId ? <InlineAlert title={ui('Live guest flow')} message={ui('Saving edits to this selected journey updates the live guest flow, including children that still follow it.')} severity="warning" /> : null}
        <ExperienceTemplatePageEditor
          template={editingTemplate}
          pickerLevel={level === 'global' ? { scope: 'global' } : { scope: 'partner', partnerId: resourceId ?? '' }}
          onSaved={saveContent}
        />
      </GdsStack>
    );
  }

  return (
    <GdsStack gap="md" className="experience-journey-manager" style={{ width: '100%', maxWidth: 'none', minWidth: 0 }}>
      {error ? <InlineAlert title={ui('Journey settings')} message={error} severity="error" /> : null}
      {notice ? <InlineAlert title={ui('Saved.')} message={notice} severity="info" /> : null}
      {data?.selectionNeedsRepair ? <InlineAlert title={ui('Journey selection repaired')} message={ui('The saved default no longer exists. Descendants are currently falling back to the next valid parent journey; choose a version below to save the intended default.')} severity="warning" /> : null}
      <ExperienceJourneyList
        title={journeyName}
        description={ui('Choose one journey at this level. Partners inherit the global default; events inherit their partner default unless they choose their own.')}
        groupName={`${level}-journey-default`}
        actionNamespace="experience-template"
        rows={rows}
        canManage={canManage}
        saving={Boolean(savingId) || creating}
        renameId={renameId}
        renameValue={renameValue}
        deleteId={deleteId}
        onSelect={(value) => { if (value === 'inherit') void saveDefault('inherit'); else void saveDefault(value); }}
        onEdit={setEditingId}
        onRenameStart={(id, currentName) => { setRenameId(id); setRenameValue(currentName); }}
        onRenameChange={setRenameValue}
        onRenameSave={(id) => { const template = data?.templates.find((item) => item.templateId === id); if (template) void rename(template); }}
        onRenameCancel={() => setRenameId(null)}
        onDeleteStart={setDeleteId}
        onDeleteConfirm={(id) => { const template = data?.templates.find((item) => item.templateId === id); if (template) void remove(template); }}
        onDeleteCancel={() => setDeleteId(null)}
        onCustomize={() => {
          if (level === 'partner' && data?.globalTemplateId) void create({ source: `template:${data.globalTemplateId}`, name: templateName || 'Partner journey', makeDefault: true, openEditor: true });
        }}
        emptyMessage={level === 'global' ? ui('No journey versions yet.') : ui('No partner journeys yet. The partner currently follows the global default.')}
        listNotice={(
          <GdsStack gap="sm">
            {level === 'partner' && choice === 'inherit' ? <InlineAlert title={ui('Inherited global journey')} message={ui('This partner has no separate default. Its events follow the global journey unless an event selects its own.')} severity="info" /> : null}
            {canManage ? (
              data?.testEvents?.length ? (
                <GdsInline align="end">
                  <AdminSelect
                    name={`${level}-journey-test-event`}
                    label={ui('Test in active event')}
                    value={testEventId}
                    onChange={(value) => setTestEventId(value ?? '')}
                    data={(data.testEvents ?? []).map((event) => ({ value: event._id, label: [event.name || event.eventId || event._id, event.partnerName, event.eventDate].filter(Boolean).join(' · ') }))}
                    allowDeselect={false}
                  />
                  <MetadataText>{ui('Testing uses the real capture flow. Submissions and emails behave as usual.')}</MetadataText>
                </GdsInline>
              ) : <InlineAlert title={ui('No active events to test')} message={ui('Activate an event to test this journey in its real capture flow.')} severity="info" />
            ) : null}
          </GdsStack>
        )}
        onTest={testJourney}
        createForm={canManage && createSources.length > 0 ? (
          <GdsStack gap="sm">
            <MetadataText>{ui('Create journey version')}</MetadataText>
            <GdsInline gap="md" align="end">
              <AdminSelect name={`${level}-journey-source`} label={ui('Create from')} value={sourceChoice} onChange={(value) => setSourceChoice(value ?? '')} data={createSources} allowDeselect={false} disabled={creating} />
              <AdminTextInput name={`${level}-journey-name`} label={ui('Journey name')} value={templateName} onChange={setTemplateName} maxLength={120} />
              <SemanticButton action={`experience-template:${level}-create`} loading={creating} disabled={creating || !templateName.trim() || !sourceChoice} onClick={() => void create()} />
            </GdsInline>
          </GdsStack>
        ) : null}
      />
    </GdsStack>
  );
}
