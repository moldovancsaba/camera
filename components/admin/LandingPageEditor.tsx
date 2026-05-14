'use client';

import type { FormEvent, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LandingPageCssPresetOption } from '@/lib/landing-page-css-presets';

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
    const image = new Image();
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
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
      {children}
    </div>
  );
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
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      {children}
      {helper ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p> : null}
    </div>
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
  const [dragActive, setDragActive] = useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        void onFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 text-center transition-colors ${
        dragActive
          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
          : 'border-gray-300 bg-gray-50 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:hover:bg-gray-950'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <input
        type="file"
        className="hidden"
        disabled={disabled}
        accept={acceptLabel.includes('Markdown') ? '.md,text/markdown' : undefined}
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
      />
      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
        Click to upload or drag and drop
      </span>
      <span className="mt-1 text-xs text-gray-500 dark:text-gray-400">{acceptLabel}</span>
    </label>
  );
}

export default function LandingPageEditor({
  mode,
  eventMongoId,
  eventName,
  initialLandingPage,
  slideshows,
  layouts,
  logos,
  cssPresets,
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
      setSuccess(landingPageId ? 'Landing page updated.' : 'Landing page saved.');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save landing page');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link href="/admin/events" className="hover:text-gray-700 dark:hover:text-gray-200">Events</Link>
        <span>→</span>
        <Link href={`/admin/events/${eventMongoId}`} className="hover:text-gray-700 dark:hover:text-gray-200">{eventName}</Link>
        <span>→</span>
        <span>{landingPageId ? 'Edit Landing Page' : 'New Landing Page'}</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {landingPageId ? 'Edit Landing Page' : 'Create Landing Page'}
        </h1>
      </div>

      {error ? (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <p className="text-emerald-800 dark:text-emerald-200 font-medium">Saved</p>
          <p className="text-emerald-600 dark:text-emerald-300 text-sm mt-1">{success}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="Landing Page Basics">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Field label="Title">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional heading"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </Field>
            <Field label="Slug" helper={`Public URL: /landing/${slug || 'your-slug'}`}>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="event-promo"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                required
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </Field>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Field label="URL">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </Field>
            <Field label="URL button text">
              <input
                value={urlButtonText}
                onChange={(e) => setUrlButtonText(e.target.value)}
                placeholder="Open URL"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </Field>
          </div>
        </Section>

        <Section title="Files and Assets">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Field label="Logo (.png) and library">
                <div className="space-y-3">
                  <select
                    value={logoId}
                    onChange={(e) => setLogoId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    <option value="">No logo</option>
                    {logoOptions.map((logo) => (
                      <option key={logo.logoId} value={logo.logoId}>
                        {logo.name}
                      </option>
                    ))}
                  </select>
                  <DropZone acceptLabel="PNG only. Uploads into the logo library." onFile={handleLogoUpload} disabled={isUploadingLogo} />
                  {selectedLogo ? (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                      <img src={selectedLogo.imageUrl} alt={selectedLogo.name} className="max-h-24 w-auto object-contain" />
                    </div>
                  ) : null}
                </div>
              </Field>

              <Field label="QR code image">
                <div className="space-y-3">
                  <DropZone acceptLabel="PNG, JPG, GIF, WebP, or SVG." onFile={handleQrUpload} disabled={isUploadingQr} />
                  {qrCodeImageUrl ? (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                      <img src={qrCodeImageUrl} alt="Landing page QR code" className="max-h-40 w-auto object-contain" />
                      <button
                        type="button"
                        onClick={() => void handleRemoveQrCode()}
                        className="mt-3 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Remove QR code
                      </button>
                    </div>
                  ) : null}
                </div>
              </Field>
            </div>

            <div className="space-y-6">
              <Field label="Terms and Conditions (.md)">
                <div className="space-y-3">
                  <DropZone acceptLabel="Markdown only." onFile={(file) => handleMarkdownUpload(file, 'terms')} />
                  <textarea
                    value={termsMarkdown}
                    onChange={(e) => setTermsMarkdown(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                  />
                  {termsFileName ? <p className="text-xs text-gray-500 dark:text-gray-400">Loaded from {termsFileName}</p> : null}
                </div>
              </Field>

              <Field label="Privacy Policy (.md)">
                <div className="space-y-3">
                  <DropZone acceptLabel="Markdown only." onFile={(file) => handleMarkdownUpload(file, 'privacy')} />
                  <textarea
                    value={privacyMarkdown}
                    onChange={(e) => setPrivacyMarkdown(e.target.value)}
                    rows={10}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
                  />
                  {privacyFileName ? <p className="text-xs text-gray-500 dark:text-gray-400">Loaded from {privacyFileName}</p> : null}
                </div>
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Display and CSS">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Field label="Media source type">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="targetType"
                    checked={targetType === 'slideshow'}
                    onChange={() => {
                      setTargetType('slideshow');
                      setTargetId('');
                    }}
                  />
                  Slideshow
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="targetType"
                    checked={targetType === 'layout'}
                    onChange={() => {
                      setTargetType('layout');
                      setTargetId('');
                    }}
                  />
                  Slideshow layout
                </label>
              </div>
            </Field>
            <Field label={targetType === 'layout' ? 'Slideshow layout' : 'Slideshow'}>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                required
              >
                <option value="">Select one</option>
                {targetOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={cookieConsentEnabled}
                onChange={(e) => setCookieConsentEnabled(e.target.checked)}
              />
              Require cookie acceptance
            </label>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Field label="CSS preset">
              <select
                value={customCssPresetId}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="">Select preset</option>
                {presetOptions.map((preset) => (
                  <option key={preset.presetId} value={preset.presetId}>
                    {preset.name} ({preset.className})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="CSS class name"
              helper="Keep the same class name to update that CSS preset. Enter a new class name to save the CSS as a new preset."
            >
              <input
                value={customCssClassName}
                onChange={(e) => setCustomCssClassName(e.target.value)}
                placeholder="landing-page-theme"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </Field>
          </div>

          <Field label="CSS">
            <textarea
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              rows={22}
              placeholder=".landing-page-root { background: #000; }"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
            />
          </Field>
        </Section>

        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/admin/events/${eventMongoId}`}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || isUploadingQr || isUploadingLogo}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving…' : landingPageId ? 'Update landing page' : 'Save landing page'}
          </button>
        </div>
      </form>
    </div>
  );
}
