'use client';

import { useEffect, useState } from 'react';
import { AdminTextInput, AdminTextarea } from '@sovereignsquad/gds-admin/client';
import { GdsInline, GdsStack, InlineAlert, MetadataText, SectionPanel } from '@sovereignsquad/gds-core/client';
import SemanticButton from '@/components/gds/CameraSemanticButton';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import type { ExperienceTemplate } from '@/lib/visual-assets/contracts';

interface JourneyPage { pageId: string; pageType: string; order: number; isActive: boolean; config: Record<string, unknown> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function pagesOf(template: ExperienceTemplate): JourneyPage[] {
  if (!Array.isArray(template.config.customPages)) return [];
  return template.config.customPages.flatMap((value, index) => {
    if (!isRecord(value) || typeof value.pageId !== 'string') return [];
    return [{
      pageId: value.pageId,
      pageType: typeof value.pageType === 'string' ? value.pageType : 'page',
      order: typeof value.order === 'number' ? value.order : index,
      isActive: value.isActive !== false,
      config: isRecord(value.config) ? { ...value.config } : {},
    }];
  }).sort((left, right) => left.order - right.order);
}

export default function ExperienceTemplatePageEditor({ template, onSaved }: { template: ExperienceTemplate; onSaved: (template: ExperienceTemplate) => void }) {
  const language = useUiLanguage();
  const ui = (text: string) => adminOperationText(text, language);
  const [pages, setPages] = useState(() => pagesOf(template));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setPages(pagesOf(template)); setSaved(false); setError(null); }, [template]);

  const update = (pageId: string, change: (page: JourneyPage) => JourneyPage) => {
    setPages((current) => current.map((page) => page.pageId === pageId ? change(page) : page));
    setSaved(false);
  };

  const move = (pageId: string, delta: -1 | 1) => {
    setPages((current) => {
      const index = current.findIndex((page) => page.pageId === pageId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((page, position) => ({ ...page, order: position }));
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch(`/api/visual-assets/templates/${encodeURIComponent(template.templateId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pages: pages.map(({ pageId, order, isActive, config }) => ({
          pageId, order, isActive,
          title: typeof config.title === 'string' ? config.title : '',
          description: typeof config.description === 'string' ? config.description : '',
          buttonText: typeof config.buttonText === 'string' ? config.buttonText : '',
        })) }),
      });
      const payload = await response.json().catch(() => null) as { data?: { template?: ExperienceTemplate }; error?: string } | null;
      if (!response.ok || !payload?.data?.template) throw new Error(payload?.error || `Request failed (${response.status})`);
      onSaved(payload.data.template);
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save journey changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionPanel title={`${ui('Edit journey')}: ${template.name}`} description={ui('Edit page copy and order. Child-owned images, colours, identity, and consent remain at their own level.')}>
      <GdsStack gap="md">
        {error ? <InlineAlert title={ui('Journey update failed')} message={error} severity="error" /> : null}
        {saved ? <InlineAlert title={ui('Saved.')} message={ui('This journey version is updated.')} severity="info" /> : null}
        {pages.length === 0 ? <MetadataText>{ui('This journey has no editable pages.')}</MetadataText> : null}
        {pages.map((page, index) => (
          <SectionPanel key={page.pageId} title={`${index + 1}. ${page.pageType}`} description={page.pageId}>
            <GdsStack gap="sm">
              <GdsInline gap="sm">
                <SemanticButton action={page.isActive ? page.pageType === 'take-photo' ? 'journey-page:capture-required' : 'journey-page:hide-page' : 'journey-page:show-page'} disabled={saving || (page.pageType === 'take-photo' && page.isActive)} onClick={() => update(page.pageId, (current) => ({ ...current, isActive: !current.isActive }))}>
                  {page.isActive ? ui(page.pageType === 'take-photo' ? 'Required capture step' : 'Hide page') : ui('Show page')}
                </SemanticButton>
                <SemanticButton action="journey-page:move-earlier" disabled={saving || index === 0} onClick={() => move(page.pageId, -1)}>{ui('Move earlier')}</SemanticButton>
                <SemanticButton action="journey-page:move-later" disabled={saving || index === pages.length - 1} onClick={() => move(page.pageId, 1)}>{ui('Move later')}</SemanticButton>
              </GdsInline>
              <AdminTextInput name={`${page.pageId}-title`} label={ui('Page title')} value={typeof page.config.title === 'string' ? page.config.title : ''} onChange={(title) => update(page.pageId, (current) => ({ ...current, config: { ...current.config, title } }))} maxLength={500} />
              <AdminTextarea name={`${page.pageId}-description`} label={ui('Page description')} value={typeof page.config.description === 'string' ? page.config.description : ''} onChange={(description) => update(page.pageId, (current) => ({ ...current, config: { ...current.config, description } }))} autosize minRows={2} maxRows={6} maxLength={2000} />
              <AdminTextInput name={`${page.pageId}-button-text`} label={ui('Button text')} value={typeof page.config.buttonText === 'string' ? page.config.buttonText : ''} onChange={(buttonText) => update(page.pageId, (current) => ({ ...current, config: { ...current.config, buttonText } }))} maxLength={500} />
            </GdsStack>
          </SectionPanel>
        ))}
        <SemanticButton action="journey-template:save-content" loading={saving} disabled={saving || pages.length === 0} onClick={() => void save()}>{ui('Save journey changes')}</SemanticButton>
      </GdsStack>
    </SectionPanel>
  );
}
