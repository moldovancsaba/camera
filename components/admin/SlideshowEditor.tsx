'use client';

import React, { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Anchor, Breadcrumbs, Button, Card, Checkbox, ColorField, Field, Group, Image, NumberInput, Radio, Select, SimpleGrid, Stack, Text, TextInput } from '@/components/gds/PublicPrimitives';
import { useRouter } from 'next/navigation';
import { InlineAlert } from '@doneisbetter/gds-core/client';
import { FormSection } from '@doneisbetter/gds-admin/client';
import EditorScaffold from '@/components/admin/AdminEditorScaffold';
import {
  SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
  SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
} from '@/lib/gds/tokens/colors';

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
  submissionSourceMode?: 'originals_only' | 'approved_tryon_only' | 'originals_and_approved_tryon';
}

interface Props {
  mode: 'create' | 'edit';
  eventMongoId: string;
  eventName: string;
  initialSlideshow?: SlideshowValue | null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <FormSection title={title}>{children}</FormSection>;
}

function numberValue(value: string | number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
  const [submissionSourceMode, setSubmissionSourceMode] = useState<
    'originals_only' | 'approved_tryon_only' | 'originals_and_approved_tryon'
  >(initialSlideshow?.submissionSourceMode ?? 'originals_only');
  const [stageAspect, setStageAspect] = useState<number | null | undefined>(
    initialSlideshow?.stageAspect ?? null
  );
  const [backgroundPrimaryColor, setBackgroundPrimaryColor] = useState(
    initialSlideshow?.backgroundPrimaryColor?.trim() || SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY
  );
  const [backgroundAccentColor, setBackgroundAccentColor] = useState(
    initialSlideshow?.backgroundAccentColor?.trim() || SLIDESHOW_DEFAULT_BACKGROUND_ACCENT
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
      backgroundPrimaryColor: backgroundPrimaryColor.trim() || SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
      backgroundAccentColor: backgroundAccentColor.trim() || SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
      backgroundImageUrl: backgroundImageUrl.trim() || null,
      viewportScale,
      submissionSourceMode,
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
      if (savedSlideshow?._id) setSlideshowMongoId(String(savedSlideshow._id));
      if (savedSlideshow?.slideshowId) setSlideshowId(String(savedSlideshow.slideshowId));

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
      if (!nextImageUrl) throw new Error('Upload finished without an image URL.');
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
    <EditorScaffold
      eyebrow="Slideshow"
      title={pageTitle}
      description={`Configure playback, display behavior, and media failover for ${eventName}.`}
      maxWidth={1200}
      breadcrumbs={
        <Breadcrumbs>
          <Anchor component={Link} href="/admin/events" size="sm">
            Events
          </Anchor>
          <Anchor component={Link} href={`/admin/events/${eventMongoId}`} size="sm">
            {eventName}
          </Anchor>
          <Text size="sm">{pageTitle}</Text>
        </Breadcrumbs>
      }
    >
      {error ? <InlineAlert title="Error" message={error} severity="error" /> : null}
      {success ? <InlineAlert title="Saved" message={success} severity="success" /> : null}

      <form onSubmit={handleSubmit}>
        <Stack gap="lg">
          <Section title="Slideshow Basics">
            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
              <Field label="Name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field
                label="Status"
                helper="Inactive slideshows stay in admin but should not be used on live displays."
              >
                <Checkbox
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  label="Slideshow is active"
                />
              </Field>
            </SimpleGrid>
          </Section>

          <Section title="Playback and Stage">
            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
              <Field
                label="Stage aspect ratio"
                helper="Auto uses the event default. Override when a display or layout needs a different stage shape."
              >
                <Stack gap="sm">
                  <Select
                    value={stageAspectToSelectId(stageAspect)}
                    onChange={(id) => {
                      const nextId = id ?? 'auto';
                      if (nextId === 'auto') {
                        setStageAspect(null);
                        return;
                      }
                      if (nextId === 'custom') {
                        setStageAspect((current) =>
                          typeof current === 'number' &&
                          Number.isFinite(current) &&
                          stageAspectToSelectId(current) === 'custom'
                            ? current
                            : 16 / 9
                        );
                        return;
                      }
                      const preset = STAGE_ASPECT_PRESETS.find((item) => item.id === nextId);
                      setStageAspect(preset?.ratio ?? null);
                    }}
                    data={[
                      ...STAGE_ASPECT_PRESETS.map((preset) => ({
                        value: preset.id,
                        label: preset.label,
                      })),
                      { value: 'custom', label: 'Custom width / height...' },
                    ]}
                  />
                  {stageAspectToSelectId(stageAspect) === 'custom' ? (
                    <NumberInput
                      min={0.25}
                      max={4}
                      step={0.01}
                      value={
                        typeof stageAspect === 'number' && Number.isFinite(stageAspect)
                          ? stageAspect
                          : ''
                      }
                      onChange={(value) => {
                        const nextValue = numberValue(value, Number.NaN);
                        setStageAspect(Number.isFinite(nextValue) ? nextValue : undefined);
                      }}
                    />
                  ) : null}
                </Stack>
              </Field>

              <Field
                label="Fit vs fill"
                helper="Fit keeps the full stage visible. Fill covers the region and may crop."
              >
                <Radio.Group
                  value={viewportScale}
                  onChange={(value) => setViewportScale(value === 'fill' ? 'fill' : 'fit')}
                >
                  <Group>
                    <Radio value="fit" label="Fit (letterbox)" />
                    <Radio value="fill" label="Fill (crop)" />
                  </Group>
                </Radio.Group>
              </Field>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
              <Field
                label="Buffer (slides ahead of current)"
                helper="Visible slide is extra, so memory holds this value plus the current slide."
              >
                <NumberInput
                  min={1}
                  max={50}
                  value={bufferSize}
                  onChange={(value) => setBufferSize(numberValue(value, 1))}
                />
              </Field>
              <Field label="Refresh strategy">
                <Select
                  value={refreshStrategy}
                  onChange={(value) =>
                    setRefreshStrategy(value === 'batch' ? 'batch' : 'continuous')
                  }
                  data={[
                    { value: 'continuous', label: 'Continuous (background refresh)' },
                    { value: 'batch', label: 'Batch (reload all at once)' },
                  ]}
                />
              </Field>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
              <Field label="Slide duration (ms)">
                <NumberInput
                  min={1000}
                  max={600000}
                  step={100}
                  value={transitionDurationMs}
                  onChange={(value) =>
                    setTransitionDurationMs(
                      Math.max(1000, Math.min(600000, numberValue(value, 5000)))
                    )
                  }
                />
              </Field>
              <Field label="Fade duration (ms)">
                <NumberInput
                  min={0}
                  max={60000}
                  step={50}
                  value={fadeDurationMs}
                  onChange={(value) =>
                    setFadeDurationMs(
                      Math.max(0, Math.min(60000, numberValue(value, 0)))
                    )
                  }
                />
              </Field>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
              <Field label="Playback">
                <Radio.Group
                  value={playMode}
                  onChange={(value) => setPlayMode(value === 'once' ? 'once' : 'loop')}
                >
                  <Group>
                    <Radio value="once" label="Play once" />
                    <Radio value="loop" label="Loop" />
                  </Group>
                </Radio.Group>
              </Field>
              <Field label="Order">
                <Radio.Group
                  value={orderMode}
                  onChange={(value) => setOrderMode(value === 'random' ? 'random' : 'fixed')}
                >
                  <Group>
                    <Radio value="fixed" label="Fixed" />
                    <Radio value="random" label="Random" />
                  </Group>
                </Radio.Group>
              </Field>
            </SimpleGrid>

            <Field label="Submission source">
              <Radio.Group
                value={submissionSourceMode}
                onChange={(value) =>
                  setSubmissionSourceMode(
                    value === 'approved_tryon_only' ||
                      value === 'originals_and_approved_tryon'
                      ? value
                      : 'originals_only'
                  )
                }
              >
                <Group>
                  <Radio value="originals_only" label="Originals only" />
                  <Radio value="approved_tryon_only" label="Approved try-on results only" />
                  <Radio
                    value="originals_and_approved_tryon"
                    label="Originals + approved try-on results"
                  />
                </Group>
              </Radio.Group>
            </Field>
          </Section>

          <Section title="Background and Colors">
            <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
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
            </SimpleGrid>

            <Field
              label="Failover background photo"
              helper="Shown above the gradient and behind slide images in empty or letterboxed states."
            >
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleBackgroundFile}
              />
              <Group gap="xs">
                <Button
                  type="button"
                  disabled={isUploadingBackground || !slideshowId}
                  onClick={() => bgFileInputRef.current?.click()}
                  variant="light"
                >
                  {isUploadingBackground ? 'Uploading...' : 'Upload image'}
                </Button>
                {backgroundImageUrl?.trim() ? (
                  <Button
                    type="button"
                    onClick={() => setBackgroundImageUrl('')}
                    variant="subtle"
                  >
                    Remove photo
                  </Button>
                ) : null}
              </Group>
              {!slideshowId ? (
                <Text size="xs" c="dimmed">
                  Save the slideshow once before uploading a background image.
                </Text>
              ) : null}
              {backgroundImageUrl?.trim() ? (
                <Card withBorder padding={0}>
                  <Image src={backgroundImageUrl} alt="Background preview" h={160} fit="cover" />
                </Card>
              ) : null}
            </Field>
          </Section>

          <Group>
            <Button component={Link} href={`/admin/events/${eventMongoId}`} variant="default">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : slideshowMongoId ? 'Save changes' : 'Create slideshow'}
            </Button>
            {slideshowId ? (
              <Button
                component={Link}
                href={`/slideshow/${slideshowId}`}
                target="_blank"
                variant="light"
              >
                Open slideshow
              </Button>
            ) : null}
          </Group>
        </Stack>
      </form>
    </EditorScaffold>
  );
}
