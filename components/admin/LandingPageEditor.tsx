'use client';

import type { FormEvent, ReactNode } from 'react';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InlineAlert, SemanticButton, UploadDropzone } from '@doneisbetter/gds-core/client';
import type { LandingPageEditorActionPreset } from '@/lib/admin/build-landing-page-editor-props';
import type { LandingPageCssPresetOption } from '@/lib/landing-page-css-presets';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import { FormSection } from '@doneisbetter/gds-admin/client';
import MediaCard from '@/components/media/MediaPreviewCard';

interface TargetOption {
  id: string;
  name: string;
}

interface LogoOption {
  logoId: string;
  name: string;
  imageUrl: string;
}

interface LandingPageValue {
  _id?: string;
  slug: string;
  title?: string | null;
  description?: string | null;
  logoId?: string | null;
  qrCodeImageUrl?: string | null;
  url?: string | null;
  urlButtonText?: string | null;
  termsMarkdown?: string | null;
  termsFileName?: string | null;
  privacyMarkdown?: string | null;
  privacyFileName?: string | null;
  cookieConsentEnabled: boolean;
  targetType: 'slideshow' | 'layout';
  targetId: string;
  isActive: boolean;
  customCssPresetId?: string | null;
  customCssClassName?: string | null;
  customCss?: string | null;
}

interface Props {
  mode: 'create' | 'edit';
  eventMongoId: string;
  eventName: string;
  initialLandingPage?: LandingPageValue | null;
  slideshows: TargetOption[];
  layouts: TargetOption[];
  logos: LogoOption[];
  cssPresets: LandingPageCssPresetOption[];
  actionPresets: LandingPageEditorActionPreset[];
}

const QR_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const QR_ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load QR image preview.'));
    image.src = src;
  });
}

function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts.at(-1) ?? '' : '';
}

function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || getFileExtension(file.name) === 'svg';
}

function isSupportedRasterFile(file: File): boolean {
  return QR_ALLOWED_MIME_TYPES.has(file.type) || QR_ALLOWED_EXTENSIONS.has(getFileExtension(file.name));
}

async function svgFileToPngDataUrl(file: File): Promise<string> {
  const svgDataUrl = await fileToDataUrl(file);
  const image = await loadImageElement(svgDataUrl);
  const width = Math.max(1, image.naturalWidth || 1024);
  const height = Math.max(1, image.naturalHeight || 1024);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to prepare QR image conversion.');
  }
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return <FormSection title={title}>{children}</FormSection>;
}

function Stack({ children, gap = '1rem' }: { children: ReactNode; gap?: string | number; [key: string]: unknown }) {
  return <div style={{ display: 'grid', gap }}>{children}</div>;
}

function Group({ children, justify }: { children: ReactNode; justify?: string; [key: string]: unknown }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: justify }}>{children}</div>;
}

function SimpleGrid({ children }: { children: ReactNode; [key: string]: unknown }) {
  return <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>{children}</div>;
}

function Text({ children, size, c }: { children: ReactNode; size?: string; c?: string; [key: string]: unknown }) {
  return <span style={{ color: c === 'dimmed' ? 'var(--gds-color-muted)' : undefined, display: 'block', fontSize: size === 'xs' ? '0.75rem' : size === 'sm' ? '0.875rem' : size }}>{children}</span>;
}

function TextInput({ value, onChange, required, placeholder }: { value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; placeholder?: string }) {
  return <input value={value} onChange={onChange} required={required} placeholder={placeholder} style={{ minHeight: 44, padding: '0 0.75rem' }} />;
}

function Textarea({ value, onChange, rows, placeholder }: { value: string; onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number; placeholder?: string; [key: string]: unknown }) {
  return <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder} style={{ padding: '0.75rem' }} />;
}

function Select({ value, onChange, data }: { value: string; onChange: (value: string) => void; data: Array<{ value: string; label: string }>; [key: string]: unknown }) {
  return <select value={value} onChange={(event) => onChange(event.currentTarget.value)} style={{ minHeight: 44, padding: '0 0.75rem' }}>{data.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>;
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; label: string }) {
  return <label style={{ alignItems: 'center', display: 'flex', gap: '0.5rem', fontWeight: 700 }}><input type="checkbox" checked={checked} onChange={onChange} />{label}</label>;
}

function Radio({ value, label }: { value: string; label: string }) {
  return <option value={value}>{label}</option>;
}

Radio.Group = function RadioGroup({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  const options = React.Children.toArray(children)
    .flatMap((child) => {
      if (!React.isValidElement(child)) return [];
      if (child.type === Group) return React.Children.toArray((child.props as { children?: ReactNode }).children);
      return [child];
    })
    .filter(React.isValidElement) as Array<React.ReactElement<{ value: string; label: string }>>;
  return <select value={value} onChange={(event) => onChange(event.currentTarget.value)} style={{ minHeight: 44, padding: '0 0.75rem' }}>{options.map((option) => <option key={option.props.value} value={option.props.value}>{option.props.label}</option>)}</select>;
};

function Button({ children, component, href, target, variant, type = 'button', disabled, onClick }: { children: ReactNode; component?: typeof Link; href?: string; target?: string; variant?: string; type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void; [key: string]: unknown }) {
  const button = <SemanticButton action="landing-pages:editor-action" type={type} variant={variant === 'default' || variant === 'light' ? 'secondary' : undefined} disabled={disabled} onClick={onClick}>{children}</SemanticButton>;
  return component === Link && href ? <Link href={href} target={target} style={{ textDecoration: 'none' }}>{button}</Link> : button;
}

function Card({ children }: { children: ReactNode; [key: string]: unknown }) {
  return <section style={{ border: '1px solid var(--gds-color-border)', borderRadius: '0.875rem', padding: '1rem' }}>{children}</section>;
}

function Breadcrumbs({ children }: { children: ReactNode }) {
  return <nav aria-label="Breadcrumb" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>{children}</nav>;
}

function Anchor({ component, href, children }: { component?: typeof Link; href: string; children: ReactNode; [key: string]: unknown }) {
  return component === Link ? <Link href={href}>{children}</Link> : <a href={href}>{children}</a>;
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
      </Text>
      {children}
      {helper ? (
        <Text size="xs" c="dimmed">
          {helper}
        </Text>
      ) : null}
    </Stack>
  );
}

function DropZone({
  acceptLabel,
  onFile,
  disabled,
}: {
  acceptLabel: string;
  onFile: (file: File | null) => void | Promise<void>;
  disabled?: boolean;
}) {
  return (
    <div aria-disabled={disabled}>
      <UploadDropzone
        accept={acceptLabel.includes('Markdown') ? 'text/markdown,.md' : undefined}
        title="Click to upload or drag and drop"
        description={acceptLabel}
        onFilesSelected={(files) => void onFile(files[0] ?? null)}
        actionLabel={acceptLabel.includes('Markdown') ? 'Choose Markdown file' : 'Choose file'}
      />
    </div>
  );
}

export default function LandingPageEditor({
  eventMongoId,
  eventName,
  initialLandingPage,
  slideshows,
  layouts,
  logos,
  cssPresets,
  actionPresets,
}: Props) {
  const router = useRouter();
  const [landingPageId, setLandingPageId] = useState(initialLandingPage?._id ?? '');
  const [slug, setSlug] = useState(initialLandingPage?.slug ?? '');
  const [title, setTitle] = useState(initialLandingPage?.title ?? '');
  const [description, setDescription] = useState(initialLandingPage?.description ?? '');
  const [logoId, setLogoId] = useState(initialLandingPage?.logoId ?? '');
  const [logoOptions, setLogoOptions] = useState(logos);
  const [qrCodeImageUrl, setQrCodeImageUrl] = useState(initialLandingPage?.qrCodeImageUrl ?? '');
  const [url, setUrl] = useState(initialLandingPage?.url ?? '');
  const [urlButtonText, setUrlButtonText] = useState(initialLandingPage?.urlButtonText ?? '');
  const [termsMarkdown, setTermsMarkdown] = useState(initialLandingPage?.termsMarkdown ?? '');
  const [termsFileName, setTermsFileName] = useState(initialLandingPage?.termsFileName ?? '');
  const [privacyMarkdown, setPrivacyMarkdown] = useState(initialLandingPage?.privacyMarkdown ?? '');
  const [privacyFileName, setPrivacyFileName] = useState(initialLandingPage?.privacyFileName ?? '');
  const [cookieConsentEnabled, setCookieConsentEnabled] = useState(initialLandingPage?.cookieConsentEnabled ?? false);
  const [targetType, setTargetType] = useState<'slideshow' | 'layout'>(initialLandingPage?.targetType ?? 'slideshow');
  const [targetId, setTargetId] = useState(initialLandingPage?.targetId ?? '');
  const [isActive, setIsActive] = useState(initialLandingPage?.isActive ?? true);
  const [presetOptions, setPresetOptions] = useState(cssPresets);
  const [customCssPresetId, setCustomCssPresetId] = useState(initialLandingPage?.customCssPresetId ?? '');
  const [customCssClassName, setCustomCssClassName] = useState(initialLandingPage?.customCssClassName ?? '');
  const [customCss, setCustomCss] = useState(initialLandingPage?.customCss ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyActionPreset = (preset: LandingPageEditorActionPreset) => {
    setUrl(preset.url);
    setUrlButtonText((currentValue) => (currentValue.trim() ? currentValue : preset.buttonText));
    setSuccess(`Applied "${preset.label}" preset to the call-to-action.`);
    setError(null);
  };

  const targetOptions = useMemo(
    () => (targetType === 'layout' ? layouts : slideshows),
    [layouts, slideshows, targetType]
  );

  const selectedLogo = useMemo(
    () => logoOptions.find((logo) => logo.logoId === logoId) ?? null,
    [logoId, logoOptions]
  );

  const persistQrCodeImageUrl = async (nextQrCodeImageUrl: string) => {
    if (!landingPageId) return;
    const res = await fetch(`/api/landing-pages/${landingPageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrCodeImageUrl: nextQrCodeImageUrl }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || payload.message || 'Failed to persist QR code image');
    }
  };

  const handleQrUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingQr(true);
    setSuccess(null);
    setError(null);
    try {
      let imageData: string;
      let uploadFileName = `landing-qr-${Date.now()}`;
      if (isSvgFile(file)) {
        imageData = await svgFileToPngDataUrl(file);
        uploadFileName += '.png';
      } else if (isSupportedRasterFile(file)) {
        imageData = await fileToDataUrl(file);
        const extension = getFileExtension(file.name);
        if (extension) uploadFileName += `.${extension}`;
      } else {
        throw new Error('QR code images must be PNG, JPG, GIF, WebP, or SVG.');
      }

      const res = await fetch('/api/upload-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, name: uploadFileName }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || payload.message || 'Failed to upload QR code image');
      }
      const nextQrCodeImageUrl = String(payload?.data?.imageUrl ?? '');
      if (!nextQrCodeImageUrl) {
        throw new Error('Upload finished without an image URL.');
      }
      setQrCodeImageUrl(nextQrCodeImageUrl);
      await persistQrCodeImageUrl(nextQrCodeImageUrl);
      setSuccess(
        landingPageId
          ? 'QR code uploaded and saved.'
          : 'QR code uploaded. Save the landing page to persist it.'
      );
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload QR code image');
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleRemoveQrCode = async () => {
    setError(null);
    setSuccess(null);
    try {
      setQrCodeImageUrl('');
      await persistQrCodeImageUrl('');
      setSuccess(
        landingPageId
          ? 'QR code removed and saved.'
          : 'QR code removed. Save the landing page to persist the removal.'
      );
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove QR code image');
    }
  };

  const handleMarkdownUpload = async (file: File | null, kind: 'terms' | 'privacy') => {
    if (!file) return;
    if (!/\.md$/i.test(file.name)) {
      setError('Terms and privacy uploads must be .md files.');
      return;
    }
    try {
      const text = await fileToText(file);
      if (kind === 'terms') {
        setTermsMarkdown(text);
        setTermsFileName(file.name);
      } else {
        setPrivacyMarkdown(text);
        setPrivacyFileName(file.name);
      }
      setError(null);
      setSuccess(`${kind === 'terms' ? 'Terms and conditions' : 'Privacy policy'} loaded.`);
    } catch {
      setError(`Failed to read ${kind} markdown file.`);
    }
  };

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return;
    if (file.type !== 'image/png' && getFileExtension(file.name) !== 'png') {
      setError('Uploaded landing-page logos must be PNG files.');
      return;
    }
    setIsUploadingLogo(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.replace(/\.png$/i, ''));
      formData.append('description', 'Landing page logo');
      formData.append('isActive', 'true');
      const res = await fetch('/api/logos', { method: 'POST', body: formData });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || payload.message || 'Failed to upload logo');
      }
      const createdLogo = payload?.data?.logo;
      if (!createdLogo?.logoId || !createdLogo?.imageUrl) {
        throw new Error('Logo upload finished without a usable result.');
      }
      const nextLogo = {
        logoId: String(createdLogo.logoId),
        name: String(createdLogo.name ?? file.name),
        imageUrl: String(createdLogo.imageUrl),
      };
      setLogoOptions((current) => [nextLogo, ...current.filter((logo) => logo.logoId !== nextLogo.logoId)]);
      setLogoId(nextLogo.logoId);
      setSuccess('Logo uploaded to the library and selected for this landing page.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload logo');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handlePresetChange = (presetId: string) => {
    setCustomCssPresetId(presetId);
    const preset = presetOptions.find((item) => item.presetId === presetId);
    if (!preset) return;
    setCustomCssClassName(preset.className);
    setCustomCss(preset.css);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccess(null);
    setError(null);

    const payload = {
      eventMongoId,
      slug,
      title,
      description,
      logoId,
      qrCodeImageUrl,
      url,
      urlButtonText,
      termsMarkdown,
      termsFileName,
      privacyMarkdown,
      privacyFileName,
      cookieConsentEnabled,
      targetType,
      targetId,
      isActive,
      customCssPresetId,
      customCssPresetName: customCssClassName.trim() || null,
      customCssClassName,
      customCss,
    };

    try {
      const endpoint = landingPageId ? `/api/landing-pages/${landingPageId}` : '/api/landing-pages';
      const method = landingPageId ? 'PATCH' : 'POST';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const payloadResult = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payloadResult.error || payloadResult.message || 'Failed to save landing page');
      }
      const savedLandingPage = payloadResult?.data?.landingPage;
      if (savedLandingPage?._id) {
        setLandingPageId(String(savedLandingPage._id));
      }
      if (savedLandingPage?.customCssPresetId && savedLandingPage?.customCssClassName && savedLandingPage?.customCss) {
        setCustomCssPresetId(String(savedLandingPage.customCssPresetId));
        setPresetOptions((current) => {
          const next = {
            presetId: String(savedLandingPage.customCssPresetId),
            name: String(savedLandingPage.customCssClassName),
            className: String(savedLandingPage.customCssClassName),
            css: String(savedLandingPage.customCss),
            isSystem: false,
          };
          const deduped = current.filter((item) => item.presetId !== next.presetId && item.className !== next.className);
          return [next, ...deduped];
        });
      }
      setSuccess(landingPageId ? 'Experience page updated.' : 'Experience page saved.');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save experience page');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <EditorScaffold
      eyebrow="Experience Surfaces"
      title={landingPageId ? 'Edit Experience Landing Page' : 'Create Experience Landing Page'}
      description={`Build a reusable public surface for ${eventName}. The page can embed a slideshow or layout and also route guests into app actions like event capture.`}
      maxWidth={1200}
      breadcrumbs={
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/events" size="sm">
            Events
          </Anchor>
          <Anchor component={Link} href={`/admin/events/${eventMongoId}`} size="sm">
            {eventName}
          </Anchor>
          <Text size="sm">{landingPageId ? 'Edit Experience Page' : 'New Experience Page'}</Text>
        </Breadcrumbs>
      }
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}

      {success ? <InlineAlert title="Saved" message={success} severity="success" /> : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
        <Section title="Experience Basics">
          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <Field label="Title">
              <TextInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional heading"
              />
            </Field>
            <Field label="Slug" helper={`Public URL: /landing/${slug || 'your-slug'}`}>
              <TextInput
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="event-promo"
                required
              />
            </Field>
          </SimpleGrid>
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </Field>
          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <Field
              label="Action URL"
              helper="Optional. Use this to send visitors into capture, registration, gallery, or any other app flow."
            >
              <TextInput
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </Field>
            <Field
              label="Action button text"
              helper="Examples: Send a Selfie, Join Event, View Gallery."
            >
              <TextInput
                value={urlButtonText}
                onChange={(e) => setUrlButtonText(e.target.value)}
                placeholder="Open experience"
              />
            </Field>
          </SimpleGrid>
          {actionPresets.length > 0 ? (
            <Card withBorder>
              <Stack gap="md">
                <div>
                  <Text size="sm" fw={700}>
                    App action presets
                  </Text>
                  <Text mt={4} size="xs" c="dimmed">
                  Prefill the action URL and button text from common Camera app flows, then fine-tune the copy if needed.
                  </Text>
                </div>
              <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="sm">
                {actionPresets.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="light"
                    onClick={() => applyActionPreset(preset)}
                    styles={{ root: { height: 'auto', justifyContent: 'flex-start', padding: '1rem' }, inner: { alignItems: 'flex-start' }, label: { width: '100%' } }}
                  >
                    <Stack gap={4} align="flex-start">
                      <Text size="sm" fw={700}>{preset.label}</Text>
                      <Text size="xs" c="dimmed">{preset.description}</Text>
                      <Text size="11px" c="dimmed" style={{ wordBreak: 'break-all' }}>{preset.url}</Text>
                    </Stack>
                  </Button>
                ))}
              </SimpleGrid>
              </Stack>
            </Card>
          ) : null}
        </Section>

        <Section title="Files and Assets">
          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <Stack gap="md">
              <Field label="Logo (.png) and library">
                <Stack gap="md">
                  <Select
                    value={logoId}
                    onChange={(value) => setLogoId(value ?? '')}
                    data={[{ value: '', label: 'No logo' }, ...logoOptions.map((logo) => ({ value: logo.logoId, label: logo.name }))]}
                  />
                  <DropZone acceptLabel="PNG only. Uploads into the logo library." onFile={handleLogoUpload} disabled={isUploadingLogo} />
                  {selectedLogo ? (
                    <MediaCard src={selectedLogo.imageUrl} alt={selectedLogo.name} ratio={16 / 9} padding={16} />
                  ) : null}
                </Stack>
              </Field>

              <Field
                label="QR code image"
                helper="Useful when the landing page also needs to hand off guests into another app flow from a screen or print asset."
              >
                <Stack gap="md">
                  <DropZone acceptLabel="PNG, JPG, GIF, WebP, or SVG." onFile={handleQrUpload} disabled={isUploadingQr} />
                  {qrCodeImageUrl ? (
                    <MediaCard
                      src={qrCodeImageUrl}
                      alt="Landing page QR code"
                      ratio={1}
                      action={
                        <Button
                        type="button"
                        size="xs"
                        variant="default"
                        onClick={() => void handleRemoveQrCode()}
                      >
                        Remove QR code
                        </Button>
                      }
                    />
                  ) : null}
                </Stack>
              </Field>
            </Stack>

            <Stack gap="lg">
              <Field label="Terms and Conditions (.md)">
                <Stack gap="md">
                  <DropZone acceptLabel="Markdown only." onFile={(file) => handleMarkdownUpload(file, 'terms')} />
                  <Textarea
                    value={termsMarkdown}
                    onChange={(e) => setTermsMarkdown(e.target.value)}
                    rows={10}
                    styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                  />
                  {termsFileName ? <Text size="xs" c="dimmed">Loaded from {termsFileName}</Text> : null}
                </Stack>
              </Field>

              <Field label="Privacy Policy (.md)">
                <Stack gap="md">
                  <DropZone acceptLabel="Markdown only." onFile={(file) => handleMarkdownUpload(file, 'privacy')} />
                  <Textarea
                    value={privacyMarkdown}
                    onChange={(e) => setPrivacyMarkdown(e.target.value)}
                    rows={10}
                    styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                  />
                  {privacyFileName ? <Text size="xs" c="dimmed">Loaded from {privacyFileName}</Text> : null}
                </Stack>
              </Field>
            </Stack>
          </SimpleGrid>
        </Section>

        <Section title="Primary Experience and CSS">
          <Text size="sm" c="dimmed">
            Choose which Camera Core surface is embedded on this page today. The surrounding copy and CTA can still direct users into related app experiences.
          </Text>
          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <Field label="Embedded experience type">
              <Radio.Group value={targetType} onChange={(value) => {
                setTargetType(value as 'slideshow' | 'layout');
                setTargetId('');
              }}>
                <Group>
                  <Radio value="slideshow" label="Slideshow experience" />
                  <Radio value="layout" label="Slideshow layout experience" />
                </Group>
              </Radio.Group>
            </Field>
            <Field
              label={targetType === 'layout' ? 'Slideshow layout target' : 'Slideshow target'}
              helper={targetType === 'layout'
                ? 'Select the multi-cell layout this experience page should embed.'
                : 'Select the slideshow this experience page should embed.'}
            >
              <Select
                value={targetId}
                onChange={(value) => setTargetId(value ?? '')}
                data={[{ value: '', label: 'Select one' }, ...targetOptions.map((option) => ({ value: option.id, label: option.name }))]}
                required
              />
            </Field>
          </SimpleGrid>

          <Group>
            <Checkbox checked={isActive} onChange={(e) => setIsActive(e.currentTarget.checked)} label="Active" />
            <Checkbox
              checked={cookieConsentEnabled}
              onChange={(e) => setCookieConsentEnabled(e.currentTarget.checked)}
              label="Require cookie acceptance"
            />
          </Group>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <Field label="CSS preset">
              <Select
                value={customCssPresetId}
                onChange={(value) => handlePresetChange(value ?? '')}
                data={[
                  { value: '', label: 'Select preset' },
                  ...presetOptions.map((preset) => ({
                    value: preset.presetId,
                    label: `${preset.name} (${preset.className})`,
                  })),
                ]}
              />
            </Field>
            <Field
              label="CSS class name"
              helper="Keep the same class name to update that CSS preset. Enter a new class name to save the CSS as a new preset. Creator CSS remains landing-page-owned and is rendered after the base landing shell CSS."
            >
              <TextInput
                value={customCssClassName}
                onChange={(e) => setCustomCssClassName(e.target.value)}
                placeholder="landing-page-theme"
              />
            </Field>
          </SimpleGrid>

          <Field label="CSS">
            <Textarea
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              rows={22}
              placeholder=".landing-page-root { background: black; }"
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            />
            <Text size="xs" c="dimmed">
              Custom landing-page CSS is intentionally creator-owned. It is saved with the page or preset and injected after the base landing stylesheet so creative themes can override the default presentation.
            </Text>
          </Field>
        </Section>

        <Group justify="flex-end">
          <Button component={Link} href={`/admin/events/${eventMongoId}`} variant="default">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || isUploadingQr || isUploadingLogo}
          >
            {isSubmitting ? 'Saving…' : landingPageId ? 'Update experience page' : 'Save experience page'}
          </Button>
        </Group>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
