'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, ColorInput, Field, Group, NumberInput, Radio, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@/components/gds/PublicPrimitives';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import ScreenDesignFields, { designFromDraft, draftFromDesign, type ScreenDesignDraft } from '@/components/admin/ScreenDesignFields';
import ParentSlideshowPreview from '@/components/admin/ParentSlideshowPreview';
import ImagePicker from '@/components/admin/library/ImagePicker';
import type { ParentSlideshowTemplate, PartnerDefaultLandingPage, PartnerDefaultSlideshow } from '@/lib/db/schemas';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';
import { IMAGE_FILE_TYPES, IMAGE_FILE_WORDS } from '@/lib/library/image-files';
import type { PickerLevel } from '@/lib/library/picker';

type Kind = 'slideshow' | 'landingPage';
type Props = {
  scope?: 'global' | 'partner';
  partnerId?: string;
  partnerName: string;
  kind: Kind;
  initial: PartnerDefaultSlideshow | PartnerDefaultLandingPage | null;
  canManage?: boolean;
  slideshowTemplates?: ParentSlideshowTemplate[];
  defaultSlideshowTemplateId?: string | null;
  slideshowRevision?: number;
  inheritedSlideshow?: PartnerDefaultSlideshow | null;
};

const DEFAULT_SLIDESHOW: PartnerDefaultSlideshow = {
  name: 'Partner default slideshow', isActive: true, transitionDurationMs: 5000, fadeDurationMs: 1000,
  bufferSize: 10, refreshStrategy: 'continuous', playMode: 'loop', orderMode: 'fixed', crossfade: false,
  backgroundPrimaryColor: SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY, backgroundAccentColor: SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, backgroundImageUrl: null,
  viewportScale: 'fit', stageAspect: null, screenDesign: null,
};
const DEFAULT_LANDING: PartnerDefaultLandingPage = {
  title: '', description: '', logoId: null, logoUrl: null, qrCodeImageUrl: null, url: null, urlButtonText: null,
  termsMarkdown: null, termsFileName: null, privacyMarkdown: null, privacyFileName: null, backgroundColor: null,
  titleColor: null, descriptionColor: null, qrTitleColor: null, cookiesTitleColor: null, cookiesBodyColor: null,
  legalTitleColor: null, legalLinkTextColor: null, buttonColor: null, buttonTextColor: null,
  customCssPresetId: null, customCssClassName: null, customCss: null, cookieConsentEnabled: false,
  cookieConsentRequired: true, isActive: true,
};

export default function PartnerContentDefaultsEditor({
  scope = 'partner', partnerId, partnerName, kind, initial, canManage = true,
  slideshowTemplates = [], defaultSlideshowTemplateId = null, slideshowRevision = 0, inheritedSlideshow = null,
}: Props) {
  const router = useRouter();
  const [slideshow, setSlideshow] = useState<PartnerDefaultSlideshow>({ ...DEFAULT_SLIDESHOW, ...(kind === 'slideshow' ? initial as PartnerDefaultSlideshow | null : null) });
  const [landing, setLanding] = useState<PartnerDefaultLandingPage>({ ...DEFAULT_LANDING, ...(kind === 'landingPage' ? initial as PartnerDefaultLandingPage | null : null) });
  const [screenDraft, setScreenDraft] = useState<ScreenDesignDraft>(() => draftFromDesign(kind === 'slideshow' ? (initial as PartnerDefaultSlideshow | null)?.screenDesign : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [templates, setTemplates] = useState(slideshowTemplates);
  const [defaultTemplateId, setDefaultTemplateId] = useState(defaultSlideshowTemplateId);
  const [revision, setRevision] = useState(slideshowRevision);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [renameTemplateId, setRenameTemplateId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const isSlideshow = kind === 'slideshow';
  const isGlobal = scope === 'global';
  const endpoint = isGlobal ? '/api/admin/global-content-defaults' : `/api/partners/${partnerId}/content-defaults`;
  const ownerLabel = isGlobal ? 'Global' : 'Partner';
  const pickerLevel: PickerLevel = isGlobal ? { scope: 'global' } : { scope: 'partner', partnerId: partnerId ?? '' };
  const value = isSlideshow ? { ...slideshow, screenDesign: designFromDraft(screenDraft) } : landing;

  const saveTemplateState = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid slideshow response.');
    const outer = (payload as { data?: unknown }).data;
    const data = outer && typeof outer === 'object' ? outer as Record<string, unknown> : null;
    const state = isGlobal ? data : data?.contentDefaults && typeof data.contentDefaults === 'object' ? data.contentDefaults as Record<string, unknown> : null;
    if (!state || !Array.isArray(state.slideshowTemplates)) throw new Error('The server returned an invalid slideshow list.');
    setTemplates(state.slideshowTemplates as ParentSlideshowTemplate[]);
    setDefaultTemplateId(typeof state.defaultSlideshowTemplateId === 'string' ? state.defaultSlideshowTemplateId : null);
    setRevision(Math.max(0, Number(state.revision) || 0));
  };

  const mutateTemplate = async (operation: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'slideshowTemplate', revision, ...operation }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload as { error?: string; message?: string }).error || (payload as { message?: string }).message || 'Could not update the slideshow list.');
    saveTemplateState(payload);
  };

  const updateLanding = <K extends keyof PartnerDefaultLandingPage>(key: K, next: PartnerDefaultLandingPage[K]) => setLanding((current) => ({ ...current, [key]: next }));
  const updateSlideshow = <K extends keyof PartnerDefaultSlideshow>(key: K, next: PartnerDefaultSlideshow[K]) => setSlideshow((current) => ({ ...current, [key]: next }));

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      if (isSlideshow) {
        const isNew = editingTemplateId === 'new';
        await mutateTemplate({
          action: isNew ? 'create' : 'update',
          ...(isNew ? { name: slideshow.name, makeDefault: isGlobal && templates.length === 0 } : { templateId: editingTemplateId }),
          value,
        });
        setSaved(true);
        setEditingTemplateId(null);
        router.refresh();
        return;
      }
      const response = await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || `Could not save the ${ownerLabel.toLowerCase()} default.`);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not save the ${ownerLabel.toLowerCase()} default.`);
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value: null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || `Could not remove the ${ownerLabel.toLowerCase()} default.`);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not remove the ${ownerLabel.toLowerCase()} default.`);
    } finally { setBusy(false); }
  };

  const createTemplate = () => {
    const source = templates.find((template) => template.templateId === defaultTemplateId) ?? inheritedSlideshow ?? templates[0] ?? DEFAULT_SLIDESHOW;
    setSlideshow({ ...DEFAULT_SLIDESHOW, ...source, name: 'New slideshow' });
    setScreenDraft(draftFromDesign(source.screenDesign));
    setEditingTemplateId('new');
    setError(null);
    setSaved(false);
  };

  const selectTemplate = async (value: string) => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const templateId = value === 'inherit' ? null : value;
      await mutateTemplate({ action: 'select', templateId });
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the default slideshow.');
    } finally { setBusy(false); }
  };

  const renameTemplate = async (templateId: string) => {
    if (!renameValue.trim()) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      await mutateTemplate({ action: 'rename', templateId, name: renameValue.trim() });
      setRenameTemplateId(null);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename the slideshow.');
    } finally { setBusy(false); }
  };

  const deleteTemplate = async (templateId: string) => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await mutateTemplate({ action: 'delete', templateId });
      setDeleteTemplateId(null);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the slideshow.');
    } finally { setBusy(false); }
  };

  if (isSlideshow && !editingTemplateId) {
    return (
      <EditorScaffold
        eyebrow={`${ownerLabel} slideshows`}
        title={`${ownerLabel} Slideshows`}
        description={isGlobal
          ? 'Create and manage reusable slideshow versions. Partners inherit the selected global default until they choose their own.'
          : `Create and manage slideshow versions for ${partnerName}. Events inherit the selected partner default until they choose their own.`}
        maxWidth="100%"
      >
        {error ? <InlineAlert title="Slideshow settings" message={error} severity="error" /> : null}
        {saved ? <InlineAlert title="Saved" message="The slideshow list and selected default are up to date." severity="success" /> : null}
        <Stack gap="lg">
          <FormSection title={`${ownerLabel} slideshow versions`}>
            <Radio.Group
              name={`${ownerLabel.toLowerCase()}-slideshow-default`}
              label={isGlobal ? 'Global default slideshow' : 'Default slideshow for this partner'}
              value={defaultTemplateId ?? (isGlobal ? '' : 'inherit')}
              onChange={(value) => void selectTemplate(value)}
            >
              <Stack gap="sm">
                {!isGlobal ? (
                  <Stack gap="xs" p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
                    <Radio value="inherit" label={`Inherit global default${inheritedSlideshow?.name ? `: ${inheritedSlideshow.name}` : ''}`} disabled={busy || !canManage} />
                    <Text c="dimmed" size="sm">Events without their own default use this partner choice.</Text>
                  </Stack>
                ) : null}
                {templates.length === 0 ? <Text c="dimmed">{isGlobal ? 'No global slideshow versions yet.' : 'No partner slideshow versions yet. Events inherit the global slideshow.'}</Text> : null}
                {templates.map((template) => (
                  <Stack key={template.templateId} gap="xs" p="md" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 'var(--mantine-radius-md)' }}>
                    <Radio value={template.templateId} label={`${template.name}${defaultTemplateId === template.templateId ? ' · Selected default' : ''}`} disabled={busy || !canManage} />
                    {renameTemplateId === template.templateId ? (
                      <Stack gap="xs">
                        <Field label="Slideshow name"><TextInput value={renameValue} onChange={(event) => setRenameValue(event.currentTarget.value)} maxLength={120} /></Field>
                        <Group>
                          <Button onClick={() => void renameTemplate(template.templateId)} disabled={busy || !renameValue.trim()} loading={busy}>Save name</Button>
                          <Button variant="default" onClick={() => setRenameTemplateId(null)} disabled={busy}>Cancel</Button>
                        </Group>
                      </Stack>
                    ) : deleteTemplateId === template.templateId ? (
                      <Stack gap="xs">
                        <Text>Delete “{template.name}”? This cannot be undone.</Text>
                        <Group>
                          <Button color="red" onClick={() => void deleteTemplate(template.templateId)} loading={busy}>Delete slideshow</Button>
                          <Button variant="default" onClick={() => setDeleteTemplateId(null)} disabled={busy}>Cancel</Button>
                        </Group>
                      </Stack>
                    ) : (
                      <Group>
                        <Button variant="default" onClick={() => {
                          setSlideshow({ ...DEFAULT_SLIDESHOW, ...template });
                          setScreenDraft(draftFromDesign(template.screenDesign));
                          setEditingTemplateId(template.templateId);
                        }} disabled={!canManage || busy}>Edit slideshow</Button>
                        <Button variant="default" onClick={() => { setRenameTemplateId(template.templateId); setRenameValue(template.name); }} disabled={!canManage || busy}>Rename</Button>
                        <Button variant="default" color="red" onClick={() => setDeleteTemplateId(template.templateId)} disabled={!canManage || busy || defaultTemplateId === template.templateId}>Delete</Button>
                      </Group>
                    )}
                  </Stack>
                ))}
              </Stack>
            </Radio.Group>
          </FormSection>
          {canManage ? <Button onClick={createTemplate}>Create slideshow version</Button> : null}
        </Stack>
      </EditorScaffold>
    );
  }

  return (
    <EditorScaffold
      eyebrow={`${ownerLabel} defaults`}
      title={isSlideshow ? `${ownerLabel} Slideshow` : `${ownerLabel} Landing Page`}
      description={isSlideshow
        ? (isGlobal ? 'The fallback slideshow inherited by partners and events until they choose a more specific default.' : `The default screen configuration inherited by ${partnerName} events until an event chooses its own.`)
        : `The public landing-page design inherited by ${partnerName} events. Each event gets its own URL and can set an event-specific override.`}
      maxWidth="100%"
      preview={isSlideshow ? <ParentSlideshowPreview slideshow={slideshow} screenDraft={screenDraft} /> : undefined}
      form={(
        <>
          {error ? <InlineAlert title="Save failed" message={error} severity="error" /> : null}
          {saved ? <InlineAlert title="Saved" message={isGlobal ? 'Global default saved. Partners inherit it until they select their own default.' : 'Partner default saved. Events inherit it until an event-level override is selected.'} severity="success" /> : null}
          <Stack gap="lg">
            {isSlideshow ? <Button variant="default" onClick={() => setEditingTemplateId(null)} disabled={busy}>Back to slideshow versions</Button> : null}
            {isSlideshow ? (
              <>
                <FormSection title="Default slideshow">
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    <Field label="Name"><TextInput value={slideshow.name} onChange={(e) => updateSlideshow('name', e.currentTarget.value)} required maxLength={120} /></Field>
                    <Field label="Availability"><Checkbox checked={slideshow.isActive} onChange={(e) => updateSlideshow('isActive', e.currentTarget.checked)} label={`${ownerLabel} default slideshow is active`} /></Field>
                    <Field label="Stage aspect ratio" helper="Leave empty to use each event’s display default."><NumberInput min={0.25} max={4} step={0.01} value={slideshow.stageAspect ?? ''} onChange={(v) => updateSlideshow('stageAspect', v === '' ? null : Number(v))} /></Field>
                    <Field label="Stage scale"><Select value={slideshow.viewportScale ?? 'fit'} onChange={(v) => updateSlideshow('viewportScale', v === 'fill' ? 'fill' : 'fit')} data={[{ value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Fill' }]} /></Field>
                    <Field label="Background primary"><ColorInput value={slideshow.backgroundPrimaryColor ?? ''} onChange={(v) => updateSlideshow('backgroundPrimaryColor', v)} /></Field>
                    <Field label="Background accent"><ColorInput value={slideshow.backgroundAccentColor ?? ''} onChange={(v) => updateSlideshow('backgroundAccentColor', v)} /></Field>
                    <Field label="Slide duration (ms)"><NumberInput min={1000} max={600000} step={100} value={slideshow.transitionDurationMs} onChange={(v) => updateSlideshow('transitionDurationMs', Number(v) || 5000)} /></Field>
                    <Field label="Fade duration (ms)"><NumberInput min={0} max={60000} step={100} value={slideshow.fadeDurationMs} onChange={(v) => updateSlideshow('fadeDurationMs', Number(v) || 0)} /></Field>
                    <Field label="Buffer size"><NumberInput min={1} max={50} value={slideshow.bufferSize} onChange={(v) => updateSlideshow('bufferSize', Number(v) || 10)} /></Field>
                    <Field label="Playback options"><Stack><Checkbox checked={slideshow.crossfade === true} onChange={(e) => updateSlideshow('crossfade', e.currentTarget.checked)} label="Crossfade photos" /><Checkbox checked={slideshow.playMode === 'once'} onChange={(e) => updateSlideshow('playMode', e.currentTarget.checked ? 'once' : 'loop')} label="Play once" /><Checkbox checked={slideshow.orderMode === 'random'} onChange={(e) => updateSlideshow('orderMode', e.currentTarget.checked ? 'random' : 'fixed')} label="Random order" /></Stack></Field>
                  </SimpleGrid>
                  <ImagePicker
                    label="Background image"
                    helper="Optional image behind the slideshow photo window and transparent overlay. Select an image from this level’s library or upload one there."
                    value={slideshow.backgroundImageUrl ?? ''}
                    onChange={(url) => updateSlideshow('backgroundImageUrl', url || null)}
                    level={pickerLevel}
                    fileTypes={IMAGE_FILE_TYPES}
                    fileTypeWords={IMAGE_FILE_WORDS}
                  />
                </FormSection>
                <FormSection title="Screen design">
                  <Text size="sm" c="dimmed">The QR position and design are inherited. Each event keeps its own tracked QR address when the template is applied.</Text>
                  <ScreenDesignFields draft={screenDraft} onChange={setScreenDraft} level={pickerLevel} />
                </FormSection>
              </>
            ) : (
              <>
                <FormSection title="Landing page content">
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    <Field label="Title"><TextInput value={landing.title ?? ''} onChange={(e) => updateLanding('title', e.currentTarget.value)} /></Field>
                    <Field label="Logo URL"><TextInput value={landing.logoUrl ?? ''} onChange={(e) => updateLanding('logoUrl', e.currentTarget.value)} placeholder="https://…" /></Field>
                  </SimpleGrid>
                  <Field label="Description"><Textarea value={landing.description ?? ''} onChange={(e) => updateLanding('description', e.currentTarget.value)} rows={4} /></Field>
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    <Field label="Action URL" helper="Use {eventCaptureUrl} to make this partner CTA point to each event’s own capture page."><TextInput value={landing.url ?? ''} onChange={(e) => updateLanding('url', e.currentTarget.value)} placeholder="{eventCaptureUrl}" /></Field>
                    <Field label="Action button text"><TextInput value={landing.urlButtonText ?? ''} onChange={(e) => updateLanding('urlButtonText', e.currentTarget.value)} /></Field>
                    <Field label="QR image URL"><TextInput value={landing.qrCodeImageUrl ?? ''} onChange={(e) => updateLanding('qrCodeImageUrl', e.currentTarget.value)} placeholder="https://…" /></Field>
                    <Field label="Active"><Checkbox checked={landing.isActive} onChange={(e) => updateLanding('isActive', e.currentTarget.checked)} label="Partner landing page is active" /></Field>
                  </SimpleGrid>
                  <Stack mt="lg">
                    <Checkbox checked={landing.cookieConsentEnabled} onChange={(e) => updateLanding('cookieConsentEnabled', e.currentTarget.checked)} label="Show cookie-consent checkbox" />
                    <Checkbox checked={landing.cookieConsentRequired} disabled={!landing.cookieConsentEnabled} onChange={(e) => updateLanding('cookieConsentRequired', e.currentTarget.checked)} label="Cookie consent is required" />
                  </Stack>
                </FormSection>
                <FormSection title="Legal text">
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    <Field label="Terms and conditions"><Textarea value={landing.termsMarkdown ?? ''} onChange={(e) => updateLanding('termsMarkdown', e.currentTarget.value)} rows={8} /></Field>
                    <Field label="Privacy policy"><Textarea value={landing.privacyMarkdown ?? ''} onChange={(e) => updateLanding('privacyMarkdown', e.currentTarget.value)} rows={8} /></Field>
                  </SimpleGrid>
                </FormSection>
                <FormSection title="Appearance">
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                    {(['backgroundColor', 'titleColor', 'descriptionColor', 'buttonColor', 'buttonTextColor'] as const).map((key) => <Field key={key} label={key}><ColorInput value={landing[key] ?? ''} onChange={(v) => updateLanding(key, v)} /></Field>)}
                  </SimpleGrid>
                  <Field label="Custom CSS"><Textarea value={landing.customCss ?? ''} onChange={(e) => updateLanding('customCss', e.currentTarget.value)} rows={8} /></Field>
                </FormSection>
              </>
            )}
            <Stack gap="sm" align="flex-start">
              {canManage ? <Button onClick={() => void save()} loading={busy}>{isSlideshow ? (editingTemplateId === 'new' ? 'Create slideshow' : 'Save slideshow') : `Save ${ownerLabel.toLowerCase()} default`}</Button> : null}
              {!isSlideshow && canManage ? <Button variant="default" onClick={() => void remove()} loading={busy}>Remove {ownerLabel.toLowerCase()} default</Button> : null}
            </Stack>
          </Stack>
        </>
      )}
    >
    </EditorScaffold>
  );
}
