'use client';

import { Paper, Stack, Text } from '@/components/gds/PublicPrimitives';
import ScreenDesignLayers, { screenWindowStyle } from '@/components/slideshow/ScreenDesignLayers';
import type { PartnerDefaultSlideshow } from '@/lib/db/schemas';
import { resolveScreenDesign, type ResolvedScreenDesign, type ScreenDesign } from '@/lib/slideshow/screen-design';
import type { ScreenDesignDraft } from '@/components/admin/ScreenDesignFields';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';

function validPercent(value: number, min = 0, max = 100): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function previewWindowIsValid(draft: ScreenDesignDraft): boolean {
  const left = Number(draft.left);
  const top = Number(draft.top);
  const width = Number(draft.width);
  const height = Number(draft.height);
  return [draft.left, draft.top, draft.width, draft.height].every((value) => value.trim() !== '')
    && validPercent(left) && validPercent(top) && validPercent(width, 1) && validPercent(height, 1)
    && left + width <= 100 && top + height <= 100;
}

function previewDesign(draft: ScreenDesignDraft): ResolvedScreenDesign {
  const hasWindow = previewWindowIsValid(draft);
  const left = hasWindow ? Number(draft.left) : 10;
  const top = hasWindow ? Number(draft.top) : 10;
  const width = hasWindow ? Number(draft.width) : 80;
  const height = hasWindow ? Number(draft.height) : 80;

  const design: ScreenDesign = {
    window: { left, top, width, height },
    photoFit: draft.photoFit,
  };

  const overlay = draft.overlayImageUrl.trim();
  if (overlay) {
    design.overlayImageUrl = overlay;
    if (!draft.overlayVisible) design.overlayVisible = false;
  }

  const qrUrl = draft.qrUrl.trim();
  const qrX = Number(draft.qrX);
  const qrY = Number(draft.qrY);
  const qrSize = Number(draft.qrSize);
  if (qrUrl && [draft.qrX, draft.qrY, draft.qrSize].every((value) => value.trim() !== '')
    && validPercent(qrX) && validPercent(qrY) && validPercent(qrSize, 2) && qrX + qrSize <= 100) {
    design.qr = { url: /^[a-z][a-z\d+.-]*:/i.test(qrUrl) ? qrUrl : `https://${qrUrl}`, x: qrX, y: qrY, size: qrSize, ...(draft.qrColor.trim() ? { color: draft.qrColor.trim() } : {}), ...(!draft.qrVisible ? { visible: false } : {}) };
  }

  const texts = draft.texts.flatMap((item) => {
    const x = Number(item.x);
    const y = Number(item.y);
    const textWidth = Number(item.width);
    const size = Number(item.size);
    if (!item.text.trim() || ![item.x, item.y, item.width, item.size].every((value) => value.trim() !== '')
      || !validPercent(x) || !validPercent(y) || !validPercent(textWidth, 1) || !validPercent(size, 0.5, 30)
      || x + textWidth > 100) return [];
    return [{ text: item.text, x, y, width: textWidth, size, align: 'center' as const, ...(item.fit ? { fit: true } : {}), ...(item.color.trim() ? { color: item.color.trim() } : {}), ...(!item.visible ? { visible: false } : {}) }];
  });
  if (texts.length) design.texts = texts;

  return resolveScreenDesign(design) ?? FALLBACK_PREVIEW_DESIGN;
}

const FALLBACK_PREVIEW_DESIGN: ResolvedScreenDesign = {
  window: { left: 10, top: 10, width: 80, height: 80 },
  photoFit: 'cover',
};

/** Shared, sample-only rendering of a parent slideshow template; it never starts playback or writes event data. */
export default function ParentSlideshowPreview({ slideshow, screenDraft }: { slideshow: PartnerDefaultSlideshow; screenDraft: ScreenDesignDraft }) {
  const design = previewDesign(screenDraft);
  const primary = slideshow.backgroundPrimaryColor || SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY;
  const accent = slideshow.backgroundAccentColor || SLIDESHOW_DEFAULT_BACKGROUND_ACCENT;
  const rawAspect = slideshow.stageAspect;
  const aspect = typeof rawAspect === 'number' && rawAspect >= 0.25 && rawAspect <= 4 ? rawAspect : 16 / 9;
  const windowValuesProvided = [screenDraft.left, screenDraft.top, screenDraft.width, screenDraft.height].some((value) => value.trim() !== '');
  const validWindow = previewWindowIsValid(screenDraft);
  const previewHint = validWindow
    ? null
    : windowValuesProvided
      ? 'Photo-window values are incomplete or outside the stage. The preview uses a safe sample window until they are valid.'
      : 'Set photo-window values to preview the exact position. The sample uses a default window for now.';
  const backgroundImage = slideshow.backgroundImageUrl?.trim() ?? '';

  return (
    <Paper withBorder radius="lg" p="md">
      <Stack gap="sm">
        <Text fw={700}>Visual preview</Text>
        <Text size="sm" c="dimmed">Sample content · updates as you edit · no photos are submitted or stored</Text>
        <div
          aria-label="Live sample preview of this slideshow"
          role="img"
          style={{
            aspectRatio: String(aspect),
            background: `linear-gradient(to bottom left, ${primary}, ${accent})`,
            borderRadius: 'var(--mantine-radius-md)',
            containerType: 'size',
            isolation: 'isolate',
            overflow: 'hidden',
            position: 'relative',
            width: '100%',
          }}
        >
          {backgroundImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backgroundImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
          ) : null}
          <div
            style={{
              alignItems: 'center',
              background: 'linear-gradient(135deg, var(--mantine-color-gray-2), var(--mantine-color-gray-5))',
              color: 'var(--mantine-color-dark-7)',
              display: 'flex',
              fontSize: 'clamp(0.65rem, 2.2cqh, 1rem)',
              justifyContent: 'center',
              left: `${design.window.left}%`,
              overflow: 'hidden',
              position: 'absolute',
              top: `${design.window.top}%`,
              width: `${design.window.width}%`,
              height: `${design.window.height}%`,
              zIndex: 2,
              ...screenWindowStyle(design),
            }}
          >
            <span style={{ opacity: 0.8 }}>Sample photo</span>
          </div>
          <ScreenDesignLayers design={design} />
          {previewHint ? (
            <div style={{ bottom: '0.5rem', left: '0.5rem', position: 'absolute', zIndex: 5 }}>
              <Text size="xs" c="white" style={{ background: 'var(--gds-overlay-scrim)', borderRadius: 'var(--mantine-radius-sm)', padding: '0.25rem 0.4rem' }}>
                {previewHint}
              </Text>
            </div>
          ) : null}
        </div>
        <Text size="xs" c="dimmed">This is a visual sample, not an event player. Event photos, tracked QR visits and playback stay event-owned.</Text>
      </Stack>
    </Paper>
  );
}
