/**
 * Slideshow layout presentation: alignment + safety gradient helpers.
 *
 * Alignment uses Tailwind flex utilities only — never set width/height on the
 * flex root (that broke scaling when it overrode h-screen / collapsed layout).
 */

export type LayoutAlignVertical = 'top' | 'middle' | 'bottom';
export type LayoutAlignHorizontal = 'left' | 'center' | 'right';

export const DEFAULT_SAFETY_PRIMARY = '#312e81';
export const DEFAULT_SAFETY_ACCENT = '#0f172a';

export function normalizeLayoutAlignVertical(
  raw: unknown
): LayoutAlignVertical {
  if (raw === 'top' || raw === 'bottom') return raw;
  return 'middle';
}

export function normalizeLayoutAlignHorizontal(
  raw: unknown
): LayoutAlignHorizontal {
  if (raw === 'left' || raw === 'right') return raw;
  return 'center';
}

/** Stored value: '' or valid #RRGGBB; invalid → ''. */
export function normalizeStoredSafetyColor(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (s === '') return '';
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : '';
}

export function parseSafetyColorInput(
  raw: unknown
): { ok: true; value: string } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: '' };
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Safety gradient colors must be strings (#RRGGBB or empty)' };
  }
  const s = raw.trim();
  if (s === '') return { ok: true, value: '' };
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) {
    return {
      ok: false,
      error: 'Safety gradient colors must be empty or #RRGGBB (e.g. #312e81)',
    };
  }
  return { ok: true, value: s };
}

export function resolvedSafetyGradientColors(
  primaryStored: string,
  accentStored: string
): { primary: string; accent: string } {
  const p = normalizeStoredSafetyColor(primaryStored);
  const a = normalizeStoredSafetyColor(accentStored);
  return {
    primary: p || DEFAULT_SAFETY_PRIMARY,
    accent: a || DEFAULT_SAFETY_ACCENT,
  };
}

export function safetyGradientCss(primary: string, accent: string): string {
  return `linear-gradient(to bottom left, ${primary}, ${accent})`;
}

/**
 * Tailwind classes for flex alignment on a root that already includes `flex`
 * and `w-screen h-screen`. Do not add width/height here.
 */
export function layoutAlignmentFlexClasses(
  vertical: LayoutAlignVertical,
  horizontal: LayoutAlignHorizontal
): string {
  const v =
    vertical === 'top'
      ? 'items-start'
      : vertical === 'bottom'
        ? 'items-end'
        : 'items-center';
  const h =
    horizontal === 'left'
      ? 'justify-start'
      : horizontal === 'right'
        ? 'justify-end'
        : 'justify-center';
  return `${v} ${h}`;
}
