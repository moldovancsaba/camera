import { apiBadRequest } from '@/lib/api';
import { parseScreenDesign } from '@/lib/slideshow/screen-design';
import { SLIDESHOW_DEFAULT_BACKGROUND_ACCENT, SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY } from '@/lib/gds/tokens/colors';

const text = (value: unknown, max = 5000): string | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length > max) throw apiBadRequest('A content field is too long.');
  return normalized || null;
};

const color = (value: unknown): string | null => {
  const normalized = text(value, 7);
  if (!normalized) return null;
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(normalized)) throw apiBadRequest('Colours must be three- or six-digit hexadecimal values.');
  return normalized;
};

/** Shared validator for the global and partner slideshow templates. */
export function cleanSlideshowDefault(value: Record<string, unknown>) {
  const bounded = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(value[key] ?? fallback);
    if (!Number.isFinite(n) || n < min || n > max) throw apiBadRequest(`${key} is outside the allowed range.`);
    return Math.round(n);
  };
  const aspect = value.stageAspect == null || value.stageAspect === '' ? null : Number(value.stageAspect);
  if (aspect !== null && (!Number.isFinite(aspect) || aspect < 0.25 || aspect > 4)) throw apiBadRequest('Stage aspect must be between 0.25 and 4.');
  let screenDesign = null;
  if (value.screenDesign) {
    const parsed = parseScreenDesign(value.screenDesign);
    if (!parsed.ok) throw apiBadRequest(parsed.error);
    screenDesign = parsed.value;
  }
  return {
    name: text(value.name, 120) ?? 'Default slideshow',
    isActive: value.isActive !== false,
    transitionDurationMs: bounded('transitionDurationMs', 5000, 1000, 600000),
    fadeDurationMs: bounded('fadeDurationMs', 1000, 0, 60000),
    bufferSize: bounded('bufferSize', 10, 1, 50),
    refreshStrategy: value.refreshStrategy === 'batch' ? 'batch' as const : 'continuous' as const,
    playMode: value.playMode === 'once' ? 'once' as const : 'loop' as const,
    orderMode: value.orderMode === 'random' ? 'random' as const : 'fixed' as const,
    crossfade: value.crossfade === true,
    backgroundPrimaryColor: color(value.backgroundPrimaryColor) ?? SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
    backgroundAccentColor: color(value.backgroundAccentColor) ?? SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
    backgroundImageUrl: text(value.backgroundImageUrl, 2048),
    viewportScale: value.viewportScale === 'fill' ? 'fill' as const : 'fit' as const,
    stageAspect: aspect,
    screenDesign,
  };
}
