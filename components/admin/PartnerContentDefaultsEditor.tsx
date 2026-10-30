'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, ColorInput, Field, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@/components/gds/PublicPrimitives';
import { FormSection } from '@sovereignsquad/gds-admin/client';
import { InlineAlert } from '@sovereignsquad/gds-core/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import ScreenDesignFields, { designFromDraft, draftFromDesign, type ScreenDesignDraft } from '@/components/admin/ScreenDesignFields';
import type { PartnerDefaultLandingPage, PartnerDefaultSlideshow } from '@/lib/db/schemas';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';

type Kind = 'slideshow' | 'landingPage';
type Props = { partnerId: string; partnerName: string; kind: Kind; initial: PartnerDefaultSlideshow | PartnerDefaultLandingPage | null; canManage?: boolean };

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

export default function PartnerContentDefaultsEditor({ partnerId, partnerName, kind, initial, canManage = true }: Props) {
  const router = useRouter();
  const [slideshow, setSlideshow] = useState<PartnerDefaultSlideshow>({ ...DEFAULT_SLIDESHOW, ...(kind === 'slideshow' ? initial as PartnerDefaultSlideshow | null : null) });
  const [landing, setLanding] = useState<PartnerDefaultLandingPage>({ ...DEFAULT_LANDING, ...(kind === 'landingPage' ? initial as PartnerDefaultLandingPage | null : null) });
  const [screenDraft, setScreenDraft] = useState<ScreenDesignDraft>(() => draftFromDesign(kind === 'slideshow' ? (initial as PartnerDefaultSlideshow | null)?.screenDesign : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isSlideshow = kind === 'slideshow';
  const value = isSlideshow ? { ...slideshow, screenDesign: designFromDraft(screenDraft) } : landing;

  const updateLanding = <K extends keyof PartnerDefaultLandingPage>(key: K, next: PartnerDefaultLandingPage[K]) => setLanding((current) => ({ ...current, [key]: next }));
  const updateSlideshow = <K extends keyof PartnerDefaultSlideshow>(key: K, next: PartnerDefaultSlideshow[K]) => setSlideshow((current) => ({ ...current, [key]: next }));

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`/api/partners/${partnerId}/content-defaults`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || 'Could not save the partner default.');
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the partner default.');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await fetch(`/api/partners/${partnerId}/content-defaults`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, value: null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || 'Could not remove the partner default.');
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the partner default.');
    } finally { setBusy(false); }
  };

  return (
    <EditorScaffold
      eyebrow="Partner defaults"
      title={isSlideshow ? 'Partner Slideshow' : 'Partner Landing Page'}
      description={isSlideshow
        ? `The default screen configuration inherited by ${partnerName} events. Event editors can change their own copy.`
        : `The public landing-page design inherited by ${partnerName} events. Each event gets its own URL and can set an event-specific override.`}
      maxWidth={1180}
    >
      {error ? <InlineAlert title="Save failed" message={error} severity="error" /> : null}
      {saved ? <InlineAlert title="Saved" message="Partner default saved. Events inherit it until an event-level override is selected." severity="success" /> : null}
      <Stack gap="lg">
        {isSlideshow ? (
          <>
            <FormSection title="Default slideshow">
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Field label="Name"><TextInput value={slideshow.name} onChange={(e) => updateSlideshow('name', e.currentTarget.value)} required maxLength={120} /></Field>
                <Field label="Availability"><Checkbox checked={slideshow.isActive} onChange={(e) => updateSlideshow('isActive', e.currentTarget.checked)} label="Partner default slideshow is active" /></Field>
                <Field label="Stage aspect ratio" helper="Leave empty to use each event’s display default."><NumberInput min={0.25} max={4} step={0.01} value={slideshow.stageAspect ?? ''} onChange={(v) => updateSlideshow('stageAspect', v === '' ? null : Number(v))} /></Field>
                <Field label="Stage scale"><Select value={slideshow.viewportScale ?? 'fit'} onChange={(v) => updateSlideshow('viewportScale', v === 'fill' ? 'fill' : 'fit')} data={[{ value: 'fit', label: 'Fit' }, { value: 'fill', label: 'Fill' }]} /></Field>
                <Field label="Background primary"><ColorInput value={slideshow.backgroundPrimaryColor ?? ''} onChange={(v) => updateSlideshow('backgroundPrimaryColor', v)} /></Field>
                <Field label="Background accent"><ColorInput value={slideshow.backgroundAccentColor ?? ''} onChange={(v) => updateSlideshow('backgroundAccentColor', v)} /></Field>
                <Field label="Slide duration (ms)"><NumberInput min={1000} max={600000} step={100} value={slideshow.transitionDurationMs} onChange={(v) => updateSlideshow('transitionDurationMs', Number(v) || 5000)} /></Field>
                <Field label="Fade duration (ms)"><NumberInput min={0} max={60000} step={100} value={slideshow.fadeDurationMs} onChange={(v) => updateSlideshow('fadeDurationMs', Number(v) || 0)} /></Field>
                <Field label="Buffer size"><NumberInput min={1} max={50} value={slideshow.bufferSize} onChange={(v) => updateSlideshow('bufferSize', Number(v) || 10)} /></Field>
                <Field label="Playback options"><Stack><Checkbox checked={slideshow.crossfade === true} onChange={(e) => updateSlideshow('crossfade', e.currentTarget.checked)} label="Crossfade photos" /><Checkbox checked={slideshow.playMode === 'once'} onChange={(e) => updateSlideshow('playMode', e.currentTarget.checked ? 'once' : 'loop')} label="Play once" /><Checkbox checked={slideshow.orderMode === 'random'} onChange={(e) => updateSlideshow('orderMode', e.currentTarget.checked ? 'random' : 'fixed')} label="Random order" /></Stack></Field>
              </SimpleGrid>
            </FormSection>
            <FormSection title="Screen design">
              <Text size="sm" c="dimmed">The QR position and design are inherited. Each event keeps its own tracked QR address when the template is applied.</Text>
              <ScreenDesignFields draft={screenDraft} onChange={setScreenDraft} partnerId={partnerId} />
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
          {canManage ? <Button onClick={() => void save()} loading={busy}>Save partner default</Button> : null}
          {canManage ? <Button variant="default" onClick={() => void remove()} loading={busy}>Remove partner default</Button> : null}
        </Stack>
      </Stack>
    </EditorScaffold>
  );
}
