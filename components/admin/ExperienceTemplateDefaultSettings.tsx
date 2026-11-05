'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminSelect, AdminTextInput } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, SectionPanel, StateBlock } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import ExperienceTemplatePageEditor from '@/components/admin/ExperienceTemplatePageEditor';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminShellText } from '@/lib/i18n/admin-shell';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate } from '@/lib/visual-assets/contracts';

type Level = 'global' | 'partner';
type StoredChoice = string | 'inherit' | null;
interface SourceEvent { _id: string; eventId?: string; name?: string; partnerName?: string; eventDate?: string }
interface Data {
  templateId: StoredChoice;
  templates: ExperienceTemplate[];
  globalTemplates?: ExperienceTemplate[];
  sourceEvents?: SourceEvent[];
  globalTemplateId?: string | null;
  globalTemplateName?: string | null;
  selectionNeedsRepair?: boolean;
}
interface Props {
  level: Level;
  resourceId?: string;
  sourceEventId?: string;
  canManage?: boolean;
  sectionTitle?: 'Global User Journey' | 'Partner User Journey';
}

function apiData<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid response.');
  const data = (payload as { data?: T }).data;
  if (!data) throw new Error((payload as { error?: string }).error || 'The server returned an invalid response.');
  return data;
}

export default function ExperienceTemplateDefaultSettings({ level, resourceId, sourceEventId, canManage = false, sectionTitle }: Props) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const endpoint = level === 'global' ? '/api/visual-assets/templates/default' : `/api/partners/${encodeURIComponent(resourceId ?? '')}/experience-template`;
  const [data, setData] = useState<Data | null>(null);
  const [choice, setChoice] = useState<StoredChoice>(level === 'partner' ? 'inherit' : null);
  const [templateName, setTemplateName] = useState(level === 'global' ? 'Global default journey' : 'Partner default journey');
  const [sourceChoice, setSourceChoice] = useState('');
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
      if (level === 'global') {
        const firstTemplate = next.templates?.[0]?.templateId;
        if (firstTemplate) return `template:${firstTemplate}`;
        return next.sourceEvents?.[0]?._id ?? '';
      }
      return sourceEventId && choices.includes(`event:${sourceEventId}`)
        ? `event:${sourceEventId}`
        : next.sourceEvents?.[0]?._id && choices.includes(`event:${next.sourceEvents[0]._id}`)
          ? `event:${next.sourceEvents[0]._id}`
        : next.globalTemplates?.[0]?.templateId
          ? `template:${next.globalTemplates[0].templateId}`
          : next.templates?.[0]?.templateId
            ? `template:${next.templates[0].templateId}`
            : '';
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
  const activeTemplate = useMemo(() => data?.templates.find((template) => template.templateId === activeId) ?? null, [activeId, data?.templates]);

  const saveDefault = async (templateId: string | 'inherit') => {
    setSavingId(templateId);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ templateId: StoredChoice }>(payload);
      setChoice(level === 'partner' && typeof result.templateId !== 'string' ? 'inherit' : result.templateId);
      setData((current) => current ? { ...current, templateId: result.templateId } : current);
      setData((current) => current ? { ...current, selectionNeedsRepair: false } : current);
      setNotice(ui('Journey default saved.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this journey default.');
    } finally {
      setSavingId(null);
    }
  };

  const create = async () => {
    if (!sourceChoice || !templateName.trim()) return;
    const selectedSourceTemplateId = sourceChoice.startsWith('template:') ? sourceChoice.slice('template:'.length) : undefined;
    const selectedSourceEventId = level === 'global'
      ? (selectedSourceTemplateId ? undefined : sourceChoice)
      : sourceChoice.startsWith('event:') ? sourceChoice.slice('event:'.length) : undefined;
    if (!selectedSourceTemplateId && !selectedSourceEventId) return;
    setCreating(true); setError(null); setNotice(null);
    try {
      const response = await fetch('/api/visual-assets/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          name: templateName.trim(),
          ...(selectedSourceTemplateId ? { sourceTemplateId: selectedSourceTemplateId } : { sourceEventId: selectedSourceEventId }),
          ...(level === 'partner' ? { partnerMongoId: resourceId } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      const makeDefault = level === 'global' && !data?.templateId;
      setData((current) => current ? { ...current, templates: [result.template, ...current.templates], ...(makeDefault ? { templateId: result.template.templateId, selectionNeedsRepair: false } : {}) } : { templateId: makeDefault ? result.template.templateId : null, templates: [result.template] });
      if (makeDefault) setChoice(result.template.templateId);
      if (level === 'global') await load();
      setTemplateName('');
      setNotice(ui('Journey version created.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the journey version.');
    } finally {
      setCreating(false);
    }
  };

  const rename = async (template: ExperienceTemplate) => {
    if (!renameValue.trim()) return;
    setSavingId(template.templateId); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      const result = apiData<{ template: ExperienceTemplate }>(payload);
      setData((current) => current ? { ...current, templates: current.templates.map((item) => item.templateId === template.templateId ? result.template : item) } : current);
      setRenameId(null); setNotice(ui('Journey renamed.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not rename this journey.');
    } finally {
      setSavingId(null);
    }
  };

  const remove = async (template: ExperienceTemplate) => {
    setSavingId(template.templateId); setError(null); setNotice(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
      setData((current) => current ? { ...current, templates: current.templates.filter((item) => item.templateId !== template.templateId) } : current);
      if (activeId === template.templateId) setEditingId(null);
      setDeleteId(null); setNotice(ui('Journey deleted.'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete this journey.');
    } finally {
      setSavingId(null);
    }
  };

  const saveContent = (updated: ExperienceTemplate) => {
    setData((current) => current ? { ...current, templates: current.templates.map((item) => item.templateId === updated.templateId ? updated : item) } : current);
  };

  if (loading) return <StateBlock variant="loading" title={ui('Loading experience settings')} />;

  return (
    <SectionPanel title={sectionTitle ? adminShellText(sectionTitle, language) : ui('Experience defaults')} description={ui('Choose one journey at this level. Partners inherit the global default; events inherit their partner default unless they choose their own.') }>
      <GdsStack gap="lg">
        {error ? <InlineAlert title={ui('Journey settings')} message={error} severity="error" /> : null}
        {notice ? <InlineAlert title={ui('Saved.')} message={notice} severity="info" /> : null}
        {data?.selectionNeedsRepair ? <InlineAlert title={ui('Journey selection repaired')} message={ui('The saved default no longer exists. Descendants are currently falling back to the next valid parent journey; choose a version below to save the intended default.') } severity="warning" /> : null}
        {level === 'partner' ? (
          <SectionPanel title={ui('Partner default journey')} description={ui('Events with no Event Journey selected use this partner default.') }>
            <GdsInline gap="md" align="end">
              <MetadataText>{choice === 'inherit' ? ui('Following the global default') : (activeTemplate?.name ?? ui('Choose one journey from the list below.'))}</MetadataText>
              {choice !== 'inherit' || data?.selectionNeedsRepair ? <SemanticButton action="experience-template:partner-inherit" loading={savingId === 'inherit'} disabled={Boolean(savingId)} onClick={() => void saveDefault('inherit')}>{ui('Follow the global default')}</SemanticButton> : null}
            </GdsInline>
          </SectionPanel>
        ) : (
          <SectionPanel title={ui('Global default journey')} description={ui('Exactly one global journey is the fallback for partners and events without their own selection.') }>
            <MetadataText>{activeTemplate ? activeTemplate.name : ui('Select one journey below as the global default.')}</MetadataText>
          </SectionPanel>
        )}

        <SectionPanel title={ui('Journey versions')} description={ui('Each level has one selected default. Child levels follow that version until they select their own.') }>
          <GdsStack gap="md">
            {level === 'partner' && choice === 'inherit' ? <InlineAlert title={ui('Inherited global journey')} message={ui('This partner has no separate default. Its events follow the global journey unless an event selects its own.') } severity="info" /> : null}
            {data?.templates.map((template) => {
              const isDefault = activeId === template.templateId;
              const isRenaming = renameId === template.templateId;
              const isDeleting = deleteId === template.templateId;
              const busy = savingId === template.templateId || creating;
              return (
                <SectionPanel key={template.templateId} title={template.name} description={`${ui(template.level === 'global' ? 'Global journey' : 'Partner journey')} · ${template.templateId}`}>
                  <GdsStack gap="sm">
                    <GdsInline gap="sm" align="center">
                      <MetadataText>{isDefault ? ui('Selected default') : ui('Available journey')}</MetadataText>
                      {!isDefault ? <SemanticButton action="experience-template:select-default" loading={savingId === template.templateId} disabled={!canManage || Boolean(savingId)} onClick={() => void saveDefault(template.templateId)}>{ui('Set as default')}</SemanticButton> : null}
                      <SemanticButton action={editingId === template.templateId ? 'experience-template:close-editor' : 'experience-template:edit'} disabled={!canManage || busy} onClick={() => setEditingId(editingId === template.templateId ? null : template.templateId)}>{editingId === template.templateId ? ui('Close editor') : ui('Edit journey')}</SemanticButton>
                      {canManage && !isRenaming ? <SemanticButton action="experience-template:rename" disabled={busy} onClick={() => { setRenameId(template.templateId); setRenameValue(template.name); }}>{ui('Rename')}</SemanticButton> : null}
                      {canManage && !isDeleting ? <SemanticButton action="experience-template:delete" disabled={busy || isDefault} onClick={() => setDeleteId(template.templateId)}>{ui('Delete')}</SemanticButton> : null}
                    </GdsInline>
                    {isRenaming ? (
                      <GdsInline gap="sm" align="end">
                        <AdminTextInput name={`rename-${template.templateId}`} label={ui('Journey name')} value={renameValue} onChange={setRenameValue} maxLength={120} />
                        <SemanticButton action="experience-template:save-name" loading={busy} disabled={busy || !renameValue.trim() || renameValue.trim() === template.name} onClick={() => void rename(template)}>{ui('Save name')}</SemanticButton>
                        <SemanticButton action="experience-template:cancel-name" disabled={busy} onClick={() => setRenameId(null)}>{ui('Cancel')}</SemanticButton>
                      </GdsInline>
                    ) : null}
                    {isDeleting ? (
                      <InlineAlert title={ui('Confirm deletion')} message={ui('This journey can only be deleted after all children stop using it.')} severity="warning" />
                    ) : null}
                    {isDeleting ? <GdsInline gap="sm">
                      <SemanticButton action="experience-template:confirm-delete" loading={busy} disabled={busy} onClick={() => void remove(template)}>{ui('Confirm delete')}</SemanticButton>
                      <SemanticButton action="experience-template:cancel-delete" disabled={busy} onClick={() => setDeleteId(null)}>{ui('Cancel')}</SemanticButton>
                    </GdsInline> : null}
                    {editingId === template.templateId && isDefault ? <InlineAlert title={ui('Live guest flow')} message={ui('Saving edits to this selected journey updates the live guest flow, including children that still follow it.')} severity="warning" /> : null}
                    {editingId === template.templateId ? <ExperienceTemplatePageEditor template={template} onSaved={saveContent} /> : null}
                  </GdsStack>
                </SectionPanel>
              );
            })}
            {data?.templates.length === 0 ? <MetadataText>{ui('No journey versions yet.')}</MetadataText> : null}
          </GdsStack>
        </SectionPanel>

        {canManage && (level === 'global' ? Boolean(data?.sourceEvents?.length || data?.templates.length) : Boolean(data?.sourceEvents?.length || data?.globalTemplates?.length || data?.templates.length || sourceEventId)) ? (
          <SectionPanel title={ui('Create journey version')} description={ui('Create a reusable version from the selected parent journey or an event setup. Creation does not replace the current default.') }>
            <GdsInline gap="md" align="end">
              <AdminSelect
                name={`${level}-journey-source`}
                label={ui('Create from')}
                value={sourceChoice}
                onChange={(value) => setSourceChoice(value ?? '')}
                data={level === 'global'
                  ? [
                    ...(data?.templates ?? []).map((template) => ({ value: `template:${template.templateId}`, label: `${ui('Global journey')}: ${template.name}` })),
                    ...(data?.sourceEvents ?? []).map((event) => ({ value: event._id, label: [event.name || event.eventId || event._id, event.partnerName, event.eventDate].filter(Boolean).join(' · ') })),
                  ]
                  : [
                    ...(data?.globalTemplates ?? []).map((template) => ({ value: `template:${template.templateId}`, label: `${ui(template.templateId === data?.globalTemplateId ? 'Global default journey' : 'Global journey')}: ${template.name}` })),
                    ...(data?.templates ?? []).map((template) => ({ value: `template:${template.templateId}`, label: `${ui('Partner journey')}: ${template.name}` })),
                    ...(data?.sourceEvents ?? []).map((event) => ({ value: `event:${event._id}`, label: `${ui('Event setup')}: ${event.name || event.eventId || event._id}` })),
                  ]}
                allowDeselect={false}
                disabled={creating}
              />
              <AdminTextInput name={`${level}-journey-name`} label={ui('Journey name')} value={templateName} onChange={setTemplateName} maxLength={120} />
              <SemanticButton action={`experience-template:${level}-create`} loading={creating} disabled={creating || !templateName.trim() || !sourceChoice} onClick={() => void create()}>{ui('Create journey')}</SemanticButton>
            </GdsInline>
          </SectionPanel>
        ) : null}
      </GdsStack>
    </SectionPanel>
  );
}
