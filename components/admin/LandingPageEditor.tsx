'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
  termsMarkdown?: string | null;
  termsFileName?: string | null;
  privacyMarkdown?: string | null;
  privacyFileName?: string | null;
  cookieConsentEnabled: boolean;
  targetType: 'slideshow' | 'layout';
  targetId: string;
  isActive: boolean;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetOptions = useMemo(
    () => (targetType === 'layout' ? layouts : slideshows),
    [layouts, slideshows, targetType]
  );

  const selectedLogo = useMemo(
    () => logos.find((logo) => logo.logoId === logoId) ?? null,
    [logoId, logos]
  );

  const handleQrUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingQr(true);
    setError(null);
    try {
      const imageData = await fileToDataUrl(file);
      const res = await fetch('/api/upload-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData,
          name: `landing-qr-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload QR code image');
      }
      setQrCodeImageUrl(String(data.imageUrl ?? ''));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload QR code image');
    } finally {
      setIsUploadingQr(false);
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
      termsMarkdown,
      termsFileName,
      privacyMarkdown,
      privacyFileName,
      cookieConsentEnabled,
      targetType,
      targetId,
      isActive,
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
              {qrCodeImageUrl ? (
                <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                  <img
                    src={qrCodeImageUrl}
                    alt="Landing page QR code"
                    className="max-h-32 w-auto object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setQrCodeImageUrl('')}
                    className="mt-3 px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Remove QR code
                  </button>
                </div>
              ) : null}
            </div>
          </div>

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
