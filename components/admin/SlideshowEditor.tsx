'use client';

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const STAGE_ASPECT_PRESETS = [
  { id: 'auto', label: 'Auto (event default)', ratio: null as number | null },
  { id: '16:9', label: '16:9 (landscape)', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '1:1', label: '1:1 (square stage)', ratio: 1 },
  { id: '9:16', label: '9:16 (portrait stage)', ratio: 9 / 16 },
] as const;

function stageAspectToSelectId(stageAspect?: number | null): string {
  if (stageAspect == null || !Number.isFinite(stageAspect)) return 'auto';
  for (const preset of STAGE_ASPECT_PRESETS) {
    if (preset.ratio === null) continue;
    if (Math.abs(stageAspect - preset.ratio) < 0.02) return preset.id;
  }
  return 'custom';
}

interface SlideshowValue {
  _id?: string;
  slideshowId?: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  bufferSize?: number;
  transitionDurationMs?: number;
  fadeDurationMs?: number;
  refreshStrategy?: 'continuous' | 'batch';
  playMode?: 'once' | 'loop';
  orderMode?: 'fixed' | 'random';
  backgroundPrimaryColor?: string;
  backgroundAccentColor?: string;
  backgroundImageUrl?: string | null;
  viewportScale?: 'fit' | 'fill';
  stageAspect?: number | null;
}

interface Props {
  mode: 'create' | 'edit';
  eventMongoId: string;
  eventName: string;
  initialSlideshow?: SlideshowValue | null;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        {children}
      </div>
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
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children}
      {helper ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
      ) : null}
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
  helper,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  helper?: string;
}) {
  const safeValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#000000';

  return (
    <Field label={label} helper={helper}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={`${id}Picker`}
          value={safeValue}
          className="h-10 w-16 cursor-pointer rounded border border-gray-300 dark:border-gray-600"
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          id={id}
          value={value}
          pattern="^#[0-9A-Fa-f]{6}$"
          placeholder="#312e81"
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        />
      </div>
    </Field>
  );
}

export default function SlideshowEditor({
  eventMongoId,
  eventName,
  initialSlideshow,
}: Props) {
  const router = useRouter();
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const [slideshowMongoId, setSlideshowMongoId] = useState(initialSlideshow?._id ?? '');
  const [slideshowId, setSlideshowId] = useState(initialSlideshow?.slideshowId ?? '');
  const [name, setName] = useState(initialSlideshow?.name ?? '');
  const [isActive, setIsActive] = useState(initialSlideshow?.isActive ?? true);
  const [bufferSize, setBufferSize] = useState(initialSlideshow?.bufferSize ?? 10);
  const [transitionDurationMs, setTransitionDurationMs] = useState(
    initialSlideshow?.transitionDurationMs ?? 5000
  );
  const [fadeDurationMs, setFadeDurationMs] = useState(
    initialSlideshow?.fadeDurationMs ?? 1000
  );
  const [refreshStrategy, setRefreshStrategy] = useState<'continuous' | 'batch'>(
    initialSlideshow?.refreshStrategy ?? 'continuous'
  );
  const [playMode, setPlayMode] = useState<'once' | 'loop'>(
    initialSlideshow?.playMode ?? 'loop'
  );
  const [orderMode, setOrderMode] = useState<'fixed' | 'random'>(
    initialSlideshow?.orderMode ?? 'fixed'
  );
  const [viewportScale, setViewportScale] = useState<'fit' | 'fill'>(
    initialSlideshow?.viewportScale ?? 'fit'
  );
  const [stageAspect, setStageAspect] = useState<number | null | undefined>(
    initialSlideshow?.stageAspect ?? null
  );
  const [backgroundPrimaryColor, setBackgroundPrimaryColor] = useState(
    initialSlideshow?.backgroundPrimaryColor?.trim() || '#312e81'
  );
  const [backgroundAccentColor, setBackgroundAccentColor] = useState(
    initialSlideshow?.backgroundAccentColor?.trim() || '#0f172a'
  );
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(
    initialSlideshow?.backgroundImageUrl ?? ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pageTitle = useMemo(
    () => (slideshowMongoId ? 'Edit Slideshow' : 'Create Slideshow'),
    [slideshowMongoId]
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSuccess(null);
    setError(null);

    const payload = {
      eventId: eventMongoId,
      name,
      isActive,
      bufferSize,
      transitionDurationMs,
      fadeDurationMs,
      refreshStrategy,
      playMode,
      orderMode,
      backgroundPrimaryColor: backgroundPrimaryColor.trim() || '#312e81',
      backgroundAccentColor: backgroundAccentColor.trim() || '#0f172a',
      backgroundImageUrl: backgroundImageUrl.trim() || null,
      viewportScale,
      stageAspect: stageAspect ?? null,
    };

    try {
      const endpoint = slideshowMongoId
        ? `/api/slideshows?id=${slideshowMongoId}`
        : '/api/slideshows';
      const method = slideshowMongoId ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          responsePayload.error || responsePayload.message || 'Failed to save slideshow'
        );
      }

      const savedSlideshow = responsePayload.slideshow ?? responsePayload.data?.slideshow;
      if (savedSlideshow?._id) {
        setSlideshowMongoId(String(savedSlideshow._id));
      }
      if (savedSlideshow?.slideshowId) {
        setSlideshowId(String(savedSlideshow.slideshowId));
      }

      setSuccess(slideshowMongoId ? 'Slideshow updated.' : 'Slideshow saved.');

      if (!slideshowMongoId && savedSlideshow?._id) {
        router.replace(`/admin/events/${eventMongoId}/slideshows/${savedSlideshow._id}`);
      }
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to save slideshow'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackgroundFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !slideshowId) return;
    setIsUploadingBackground(true);
    setSuccess(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `/api/slideshows/${slideshowId}/background-image`,
        { method: 'POST', body: formData }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Failed to upload background image');
      }
      const nextImageUrl = String(payload.data?.imageUrl ?? '');
      if (!nextImageUrl) {
        throw new Error('Upload finished without an image URL.');
      }
      setBackgroundImageUrl(nextImageUrl);
      setSuccess('Background image uploaded. Save the slideshow to persist it.');
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Failed to upload background image'
      );
    } finally {
      setIsUploadingBackground(false);
      e.target.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/admin/events" className="hover:text-gray-700 dark:hover:text-gray-200">
          Events
        </Link>
        <span>→</span>
        <Link
          href={`/admin/events/${eventMongoId}`}
          className="hover:text-gray-700 dark:hover:text-gray-200"
        >
          {eventName}
        </Link>
        <span>→</span>
        <span>{pageTitle}</span>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{pageTitle}</h1>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="font-medium text-red-800 dark:text-red-200">Error</p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-300">{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="font-medium text-emerald-800 dark:text-emerald-200">Saved</p>
          <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-300">{success}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="Slideshow Basics">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Field label="Name">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                required
              />
            </Field>
            <Field
              label="Status"
              helper="Inactive slideshows stay in admin but should not be used on live displays."
            >
              <label className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                Slideshow is active
              </label>
            </Field>
          </div>
        </Section>

        <Section title="Playback and Stage">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Field
              label="Stage aspect ratio"
              helper="Auto uses the event default. Override when a display or layout needs a different stage shape."
            >
              <div className="space-y-3">
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  value={stageAspectToSelectId(stageAspect)}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id === 'auto') {
                      setStageAspect(null);
                      return;
                    }
                    if (id === 'custom') {
                      setStageAspect((current) =>
                        typeof current === 'number' &&
                        Number.isFinite(current) &&
                        stageAspectToSelectId(current) === 'custom'
                          ? current
                          : 16 / 9
                      );
                      return;
                    }
                    const preset = STAGE_ASPECT_PRESETS.find((item) => item.id === id);
                    setStageAspect(preset?.ratio ?? null);
                  }}
                >
                  {STAGE_ASPECT_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom width ÷ height…</option>
                </select>
                {stageAspectToSelectId(stageAspect) === 'custom' ? (
                  <input
                    type="number"
                    min={0.25}
                    max={4}
                    step={0.01}
                    value={
                      typeof stageAspect === 'number' && Number.isFinite(stageAspect)
                        ? stageAspect
                        : ''
                    }
                    onChange={(e) => {
                      const nextValue = parseFloat(e.target.value);
                      setStageAspect(Number.isFinite(nextValue) ? nextValue : undefined);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                  />
                ) : null}
              </div>
            </Field>

            <Field
              label="Fit vs fill"
              helper="Fit keeps the full stage visible. Fill covers the region and may crop."
            >
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="radio"
                    name="viewportScale"
                    className="accent-purple-600"
                    checked={viewportScale === 'fit'}
                    onChange={() => setViewportScale('fit')}
                  />
                  Fit (letterbox)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="radio"
                    name="viewportScale"
                    className="accent-purple-600"
                    checked={viewportScale === 'fill'}
                    onChange={() => setViewportScale('fill')}
                  />
                  Fill (crop)
                </label>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Field
              label="Buffer (slides ahead of current)"
              helper="Visible slide is extra, so memory holds this value plus the current slide."
            >
              <input
                type="number"
                min={1}
                max={50}
                value={bufferSize}
                onChange={(e) => setBufferSize(parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </Field>

            <Field label="Refresh strategy">
              <select
                value={refreshStrategy}
                onChange={(e) =>
                  setRefreshStrategy(e.target.value === 'batch' ? 'batch' : 'continuous')
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                <option value="continuous">Continuous (background refresh)</option>
                <option value="batch">Batch (reload all at once)</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Field label="Slide duration (ms)">
              <input
                type="number"
                min={1000}
                max={600000}
                step={100}
                value={transitionDurationMs}
                onChange={(e) =>
                  setTransitionDurationMs(
                    Math.max(1000, Math.min(600000, parseInt(e.target.value, 10) || 5000))
                  )
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </Field>

            <Field label="Fade duration (ms)">
              <input
                type="number"
                min={0}
                max={60000}
                step={50}
                value={fadeDurationMs}
                onChange={(e) =>
                  setFadeDurationMs(
                    Math.max(0, Math.min(60000, parseInt(e.target.value, 10) || 0))
                  )
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Field label="Playback">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="radio"
                    name="playMode"
                    className="accent-purple-600"
                    checked={playMode === 'once'}
                    onChange={() => setPlayMode('once')}
                  />
                  Play once
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="radio"
                    name="playMode"
                    className="accent-purple-600"
                    checked={playMode === 'loop'}
                    onChange={() => setPlayMode('loop')}
                  />
                  Loop
                </label>
              </div>
            </Field>

            <Field label="Order">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="radio"
                    name="orderMode"
                    className="accent-purple-600"
                    checked={orderMode === 'fixed'}
                    onChange={() => setOrderMode('fixed')}
                  />
                  Fixed
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="radio"
                    name="orderMode"
                    className="accent-purple-600"
                    checked={orderMode === 'random'}
                    onChange={() => setOrderMode('random')}
                  />
                  Random
                </label>
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Background and Colors">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ColorField
              id="backgroundPrimaryColor"
              label="Primary color (top-right)"
              value={backgroundPrimaryColor}
              onChange={setBackgroundPrimaryColor}
              helper="Used for the top-right side of the fallback gradient."
            />
            <ColorField
              id="backgroundAccentColor"
              label="Accent color (bottom-left)"
              value={backgroundAccentColor}
              onChange={setBackgroundAccentColor}
              helper="Used for the bottom-left side of the fallback gradient."
            />
          </div>

          <Field
            label="Failover background photo"
            helper="Shown above the gradient and behind slide images in empty or letterboxed states."
          >
            <input
              ref={bgFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBackgroundFile}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isUploadingBackground || !slideshowId}
                onClick={() => bgFileInputRef.current?.click()}
                className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
              >
                {isUploadingBackground ? 'Uploading…' : 'Upload image'}
              </button>
              {backgroundImageUrl?.trim() ? (
                <button
                  type="button"
                  onClick={() => setBackgroundImageUrl('')}
                  className="px-3 py-2 text-sm text-red-600 dark:text-red-400"
                >
                  Remove photo
                </button>
              ) : null}
            </div>
            {!slideshowId ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Save the slideshow once before uploading a background image.
              </p>
            ) : null}
            {backgroundImageUrl?.trim() ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backgroundImageUrl}
                  alt="Background preview"
                  className="h-40 w-full object-cover"
                />
              </div>
            ) : null}
          </Field>
        </Section>

        <div className="flex gap-3">
          <Link
            href={`/admin/events/${eventMongoId}`}
            className="rounded-lg bg-gray-200 px-4 py-2 font-semibold text-gray-900 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : slideshowMongoId ? 'Save changes' : 'Create slideshow'}
          </button>
          {slideshowId ? (
            <Link
              href={`/slideshow/${slideshowId}`}
              target="_blank"
              className="rounded-lg bg-gray-800 px-4 py-2 font-semibold text-white transition-colors hover:bg-gray-900"
            >
              Open slideshow
            </Link>
          ) : null}
        </div>
      </form>
    </div>
  );
}
