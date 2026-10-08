/**
 * The brand colours of an event and of a partner (camera#380): by default they come from messmass (the style of the event's report), and an editor can
 * overwrite them. So the stored colours are only ever **deliberate**: nothing is stored until somebody picks a colour, and clearing them brings the
 * messmass colours (or the default of the partner) back. Pure, unit-tested in brand-colours.test.ts.
 */

const HEX6 = /^#[0-9a-f]{6}$/i;

export type ParsedColour = { ok: true; value: string | null } | { ok: false };

/** One submitted colour: # and six hex digits, or nothing (null or an empty text) meaning "no colour of its own". */
export function parseBrandColour(value: unknown): ParsedColour {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const text = value.trim();
  if (text === '') return { ok: true, value: null };
  return HEX6.test(text) ? { ok: true, value: text } : { ok: false };
}

export interface BrandColours {
  brandColor?: unknown;
  brandBorderColor?: unknown;
}

export interface PartnerBrandDefaults {
  primary?: string | null;
  secondary?: string | null;
}

export type BrandColourChange =
  | {
      ok: true;
      /** What to write on the event; empty when nothing was submitted. `null` clears a colour. */
      fields: { brandColor?: string | null; brandBorderColor?: string | null; brandColorsOverridden?: boolean };
    }
  | { ok: false; error: string };

/**
 * What saving the colours of an event writes. A colour that is submitted replaces the stored one (null or empty clears it); one that is not submitted stays. The
 * event is "custom" (overridden) while it has a colour of its own. When both are cleared the event takes the default of its partner if the partner has
 * one (the same thing Reset does), else it follows messmass.
 */
export function applyEventBrandColours(current: BrandColours, input: BrandColours, partner: PartnerBrandDefaults | null | undefined): BrandColourChange {
  const primary = input.brandColor === undefined ? undefined : parseBrandColour(input.brandColor);
  const border = input.brandBorderColor === undefined ? undefined : parseBrandColour(input.brandBorderColor);
  if (primary && !primary.ok) return { ok: false, error: 'brandColor must be a colour written as # and six hex digits, or empty' };
  if (border && !border.ok) return { ok: false, error: 'brandBorderColor must be a colour written as # and six hex digits, or empty' };
  if (!primary && !border) return { ok: true, fields: {} };

  const kept = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  let nextPrimary = primary ? primary.value : kept(current.brandColor);
  let nextBorder = border ? border.value : kept(current.brandBorderColor);

  if (nextPrimary === null && nextBorder === null) {
    const inherited = { primary: kept(partner?.primary), secondary: kept(partner?.secondary) };
    if (inherited.primary || inherited.secondary) {
      nextPrimary = inherited.primary;
      nextBorder = inherited.secondary;
      return { ok: true, fields: { brandColor: nextPrimary, brandBorderColor: nextBorder, brandColorsOverridden: false } };
    }
    return { ok: true, fields: { brandColor: null, brandBorderColor: null, brandColorsOverridden: false } };
  }

  return {
    ok: true,
    fields: {
      ...(primary ? { brandColor: nextPrimary } : {}),
      ...(border ? { brandBorderColor: nextBorder } : {}),
      brandColorsOverridden: true,
    },
  };
}

export type PartnerDefaultsChange = { ok: true; value: { primary: string; secondary?: string } | { primary?: string; secondary: string } | null } | { ok: false; error: string };

/**
 * The default colours of a partner as submitted: `null` or nothing in both colours means the partner has none (its events follow messmass); otherwise colours
 * written as # and six hex digits. A partner never stores a colour that nobody picked.
 */
export function parsePartnerBrandDefaults(input: unknown): PartnerDefaultsChange {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'defaultBrandColors must be an object with primary and secondary, or null' };
  const raw = input as Record<string, unknown>;
  const primary = parseBrandColour(raw.primary);
  const secondary = parseBrandColour(raw.secondary);
  if (!primary.ok || !secondary.ok) return { ok: false, error: 'The default colours must be colours written as # and six hex digits, or empty' };
  if (primary.value === null && secondary.value === null) return { ok: true, value: null };
  return { ok: true, value: { ...(primary.value ? { primary: primary.value } : {}), ...(secondary.value ? { secondary: secondary.value } : {}) } as { primary: string; secondary?: string } };
}
