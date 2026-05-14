'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LANDING_PAGE_STYLE_PRESETS,
  getLandingPageStylePreset,
} from '@/lib/landing-page-style-presets';

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
  backgroundColor?: string | null;
  titleColor?: string | null;
  descriptionColor?: string | null;
  qrTitleColor?: string | null;
  cookiesTitleColor?: string | null;
  cookiesBodyColor?: string | null;
  legalTitleColor?: string | null;
  legalLinkTextColor?: string | null;
  buttonColor?: string | null;
  buttonTextColor?: string | null;
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
}

interface ColorFieldProps {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
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

function ColorField({
  label,
  helper,
  value,
  onChange,
}: ColorFieldProps) {
  const colorValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={colorValue}
          className="h-10 w-16 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          value={value}
          pattern="^#[0-9A-Fa-f]{6}$"
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
          placeholder="#000000"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {helper ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
      ) : null}
    </div>
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
}: Props) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialLandingPage?.slug ?? '');
  const [title, setTitle] = useState(initialLandingPage?.title ?? '');
  const [description, setDescription] = useState(initialLandingPage?.description ?? '');
  const [logoId, setLogoId] = useState(initialLandingPage?.logoId ?? '');
  const [qrCodeImageUrl, setQrCodeImageUrl] = useState(initialLandingPage?.qrCodeImageUrl ?? '');
  const [url, setUrl] = useState(initialLandingPage?.url ?? '');
  const [urlButtonText, setUrlButtonText] = useState(initialLandingPage?.urlButtonText ?? '');
  const [termsMarkdown, setTermsMarkdown] = useState(initialLandingPage?.termsMarkdown ?? '');
  const [termsFileName, setTermsFileName] = useState(initialLandingPage?.termsFileName ?? '');
  const [privacyMarkdown, setPrivacyMarkdown] = useState(initialLandingPage?.privacyMarkdown ?? '');
  const [privacyFileName, setPrivacyFileName] = useState(initialLandingPage?.privacyFileName ?? '');
  const [cookieConsentEnabled, setCookieConsentEnabled] = useState(
    initialLandingPage?.cookieConsentEnabled ?? false
  );
  const [targetType, setTargetType] = useState<'slideshow' | 'layout'>(
    initialLandingPage?.targetType ?? 'slideshow'
  );
  const [targetId, setTargetId] = useState(initialLandingPage?.targetId ?? '');
  const [isActive, setIsActive] = useState(initialLandingPage?.isActive ?? true);
  const [backgroundColor, setBackgroundColor] = useState(initialLandingPage?.backgroundColor ?? '#f8fafc');
  const [titleColor, setTitleColor] = useState(initialLandingPage?.titleColor ?? '#0f172a');
  const [descriptionColor, setDescriptionColor] = useState(initialLandingPage?.descriptionColor ?? '#475569');
  const [qrTitleColor, setQrTitleColor] = useState(initialLandingPage?.qrTitleColor ?? '#0f172a');
  const [cookiesTitleColor, setCookiesTitleColor] = useState(
    initialLandingPage?.cookiesTitleColor ?? '#0f172a'
  );
  const [cookiesBodyColor, setCookiesBodyColor] = useState(
    initialLandingPage?.cookiesBodyColor ?? '#475569'
  );
  const [legalTitleColor, setLegalTitleColor] = useState(initialLandingPage?.legalTitleColor ?? '#0f172a');
  const [legalLinkTextColor, setLegalLinkTextColor] = useState(
    initialLandingPage?.legalLinkTextColor ?? '#1e293b'
  );
  const [buttonColor, setButtonColor] = useState(initialLandingPage?.buttonColor ?? '#059669');
  const [buttonTextColor, setButtonTextColor] = useState(initialLandingPage?.buttonTextColor ?? '#ffffff');
  const [customCssPresetId, setCustomCssPresetId] = useState(initialLandingPage?.customCssPresetId ?? '');
  const [customCssClassName, setCustomCssClassName] = useState(initialLandingPage?.customCssClassName ?? '');
  const [customCss, setCustomCss] = useState(initialLandingPage?.customCss ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);

  const targetOptions = useMemo(
    () => (targetType === 'layout' ? layouts : slideshows),
    [layouts, slideshows, targetType]
  );

  const selectedLogo = useMemo(
    () => logos.find((logo) => logo.logoId === logoId) ?? null,
    [logoId, logos]
  );
  const selectedCssPreset = useMemo(
    () => getLandingPageStylePreset(customCssPresetId),
    [customCssPresetId]
  );

  const persistQrCodeImageUrl = async (nextQrCodeImageUrl: string) => {
    if (mode !== 'edit' || !initialLandingPage?._id) return;

    const res = await fetch(`/api/landing-pages/${initialLandingPage._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrCodeImageUrl: nextQrCodeImageUrl,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : typeof data.message === 'string'
            ? data.message
            : 'Failed to persist QR code image'
      );
    }
  };

  const handleQrUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingQr(true);
    setError(null);
    setQrStatus(null);
    try {
      let imageData: string;
      let uploadFileName = `landing-qr-${Date.now()}`;

      if (isSvgFile(file)) {
        imageData = await svgFileToPngDataUrl(file);
        uploadFileName += '.png';
      } else if (isSupportedRasterFile(file)) {
        imageData = await fileToDataUrl(file);
        const extension = getFileExtension(file.name);
        if (extension) {
          uploadFileName += `.${extension}`;
        }
      } else {
        throw new Error('QR code images must be PNG, JPG, GIF, WebP, or SVG.');
      }

      const res = await fetch('/api/upload-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData,
          name: uploadFileName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload QR code image');
      }
      const nextQrCodeImageUrl = String(data?.data?.imageUrl ?? '');
      if (!nextQrCodeImageUrl) {
        throw new Error('Upload finished without an image URL.');
      }
      setQrCodeImageUrl(nextQrCodeImageUrl);
      await persistQrCodeImageUrl(nextQrCodeImageUrl);
      setQrStatus(
        mode === 'edit'
          ? isSvgFile(file)
            ? 'QR code converted to PNG, uploaded, and saved.'
            : 'QR code uploaded and saved.'
          : isSvgFile(file)
            ? 'QR code converted to PNG and uploaded. Save the landing page to persist it.'
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
    setQrStatus(null);
    try {
      setQrCodeImageUrl('');
      await persistQrCodeImageUrl('');
      setQrStatus(
        mode === 'edit'
          ? 'QR code removed and saved.'
          : 'QR code removed. Save the landing page to persist the removal.'
      );
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove QR code image');
    }
  };

  const handleMarkdownUpload = async (
    file: File | null,
    kind: 'terms' | 'privacy'
  ) => {
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
    } catch {
      setError(`Failed to read ${kind} markdown file.`);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
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
      backgroundColor,
      titleColor,
      descriptionColor,
      qrTitleColor,
      cookiesTitleColor,
      cookiesBodyColor,
      legalTitleColor,
      legalLinkTextColor,
      buttonColor,
      buttonTextColor,
      customCssPresetId,
      customCssClassName,
      customCss,
    };

    try {
      const endpoint =
        mode === 'create'
          ? '/api/landing-pages'
          : `/api/landing-pages/${initialLandingPage?._id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : typeof data.message === 'string'
              ? data.message
              : 'Failed to save landing page'
        );
      }
      router.push(`/admin/events/${eventMongoId}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save landing page');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link href="/admin/events" className="hover:text-gray-700 dark:hover:text-gray-200">
          Events
        </Link>
        <span>→</span>
        <Link href={`/admin/events/${eventMongoId}`} className="hover:text-gray-700 dark:hover:text-gray-200">
          {eventName}
        </Link>
        <span>→</span>
        <span>{mode === 'create' ? 'New Landing Page' : 'Edit Landing Page'}</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {mode === 'create' ? 'Create Landing Page' : 'Edit Landing Page'}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Build a responsive event landing page that points to one slideshow or one layout.
        </p>
      </div>

      {error ? (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200 font-medium">Error</p>
          <p className="text-red-600 dark:text-red-300 text-sm mt-1">{error}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Landing Page Basics
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Slug
            </label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="event-promo"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Public URL: <span className="font-mono">/landing/{slug || 'your-slug'}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Optional heading"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-6 pt-8">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Optional description"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Media Source
          </h2>

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

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {targetType === 'layout' ? 'Slideshow layout' : 'Slideshow'}
            </label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select one</option>
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Branding and Calls To Action
          </h2>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Logo from library
              </label>
              <select
                value={logoId}
                onChange={(e) => setLogoId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="">No logo</option>
                {logos.map((logo) => (
                  <option key={logo.logoId} value={logo.logoId}>
                    {logo.name}
                  </option>
                ))}
              </select>
              {selectedLogo ? (
                <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                  <img
                    src={selectedLogo.imageUrl}
                    alt={selectedLogo.name}
                    className="max-h-24 w-auto object-contain"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                QR code image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleQrUpload(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 dark:text-gray-300"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {isUploadingQr ? 'Uploading QR code…' : 'Upload a QR image for the landing page.'}
              </p>
              {qrStatus ? (
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  {qrStatus}
                </p>
              ) : null}
              {qrCodeImageUrl ? (
                <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                  <img
                    src={qrCodeImageUrl}
                    alt="Landing page QR code"
                    className="max-h-32 w-auto object-contain"
                  />
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
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                URL
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                URL button text
              </label>
              <input
                value={urlButtonText}
                onChange={(e) => setUrlButtonText(e.target.value)}
                placeholder="Open URL"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used for the call-to-action button under the slideshow or layout.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Page Colors
          </h2>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ColorField
              label="Background color"
              helper="Applied to the landing page background."
              value={backgroundColor}
              onChange={setBackgroundColor}
            />
            <ColorField
              label="Title color"
              helper="Used for the landing page title."
              value={titleColor}
              onChange={setTitleColor}
            />
            <ColorField
              label="Description color"
              helper="Used for the landing page description text."
              value={descriptionColor}
              onChange={setDescriptionColor}
            />
            <ColorField
              label="QR title color"
              helper="Used for the QR section title."
              value={qrTitleColor}
              onChange={setQrTitleColor}
            />
            <ColorField
              label="Cookies title color"
              helper="Used for the cookies and actions heading."
              value={cookiesTitleColor}
              onChange={setCookiesTitleColor}
            />
            <ColorField
              label="Cookies text color"
              helper="Used for the cookie acceptance copy."
              value={cookiesBodyColor}
              onChange={setCookiesBodyColor}
            />
            <ColorField
              label="Legal title color"
              helper="Used for the legal section title."
              value={legalTitleColor}
              onChange={setLegalTitleColor}
            />
            <ColorField
              label="Legal link text color"
              helper="Used for the legal action button text."
              value={legalLinkTextColor}
              onChange={setLegalLinkTextColor}
            />
            <ColorField
              label="Button color"
              helper="Used for the main action button background."
              value={buttonColor}
              onChange={setButtonColor}
            />
            <ColorField
              label="Button text color"
              helper="Used for action button text."
              value={buttonTextColor}
              onChange={setButtonTextColor}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Legal Documents
          </h2>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Terms and Conditions (.md)
                </label>
                <input
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  onChange={(e) => void handleMarkdownUpload(e.target.files?.[0] ?? null, 'terms')}
                  className="block w-full text-sm text-gray-700 dark:text-gray-300"
                />
                {termsFileName ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Loaded from {termsFileName}
                  </p>
                ) : null}
              </div>
              <textarea
                value={termsMarkdown}
                onChange={(e) => setTermsMarkdown(e.target.value)}
                rows={12}
                placeholder="Markdown content for terms and conditions"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Privacy Policy (.md)
                </label>
                <input
                  type="file"
                  accept=".md,text/markdown,text/plain"
                  onChange={(e) => void handleMarkdownUpload(e.target.files?.[0] ?? null, 'privacy')}
                  className="block w-full text-sm text-gray-700 dark:text-gray-300"
                />
                {privacyFileName ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Loaded from {privacyFileName}
                  </p>
                ) : null}
              </div>
              <textarea
                value={privacyMarkdown}
                onChange={(e) => setPrivacyMarkdown(e.target.value)}
                rows={12}
                placeholder="Markdown content for privacy policy"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Optional CSS
          </h2>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                CSS preset
              </label>
              <select
                value={customCssPresetId}
                onChange={(e) => {
                  const nextPresetId = e.target.value;
                  setCustomCssPresetId(nextPresetId);
                  const preset = getLandingPageStylePreset(nextPresetId);
                  if (preset) {
                    setCustomCssClassName(preset.className);
                    setCustomCss(preset.css);
                  }
                }}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              >
                <option value="">No preset</option>
                {LANDING_PAGE_STYLE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                First preset record included: SIHF Red Ice.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Root CSS class name
              </label>
              <input
                value={customCssClassName}
                onChange={(e) => setCustomCssClassName(e.target.value)}
                placeholder="landing-page-theme"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Applied to the landing page wrapper. <span className="font-mono">landing-page-root</span> is always present.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Custom CSS
            </label>
            <textarea
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              rows={18}
              placeholder=".landing-page-root { background: #000; }"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Use this for page-level styling only. Preset selection can prefill the class name and CSS.
            </p>
            {selectedCssPreset ? (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                Preset loaded: {selectedCssPreset.name}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/admin/events/${eventMongoId}`}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || isUploadingQr}
            className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting
              ? mode === 'create'
                ? 'Saving…'
                : 'Updating…'
              : mode === 'create'
                ? 'Save landing page'
                : 'Update landing page'}
          </button>
        </div>
      </form>
    </div>
  );
}
