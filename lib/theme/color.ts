/**
 * Colour maths for the event theme (camera#285): parse the #RGB, #RRGGBB and #RRGGBBAA colours messmass styles use, flatten
 * transparency onto a background, and measure WCAG contrast so a theme is only used where its text can be read.
 * Pure and DOM-free; unit-tested in color.test.ts.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** The colour and its opacity (0 to 1); null for anything that is not a hex colour. */
export function parseColour(value: unknown): { rgb: Rgb; alpha: number } | null {
  if (typeof value !== 'string' || !HEX.test(value.trim())) return null;
  const raw = value.trim().slice(1);
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return {
    rgb: { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) },
    alpha: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  };
}

const channel = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const toHex = ({ r, g, b }: Rgb): string => `#${channel(r)}${channel(g)}${channel(b)}`;

/** The colour as an opaque #RRGGBB, flattened onto `over` when it is transparent. Null when it is not a colour. */
export function opaque(value: unknown, over: Rgb = { r: 255, g: 255, b: 255 }): string | null {
  const c = parseColour(value);
  if (!c) return null;
  const mix = (top: number, below: number) => top * c.alpha + below * (1 - c.alpha);
  return toHex({ r: mix(c.rgb.r, over.r), g: mix(c.rgb.g, over.g), b: mix(c.rgb.b, over.b) });
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two opaque colours, 1 to 21; 1 when either is not a colour. */
export function contrast(a: string, b: string): number {
  const x = parseColour(a);
  const y = parseColour(b);
  if (!x || !y) return 1;
  const [hi, lo] = [luminance(x.rgb), luminance(y.rgb)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

export const isDark = (colour: string): boolean => {
  const c = parseColour(colour);
  return c ? luminance(c.rgb) < 0.4 : false;
};

const WHITE = '#ffffff';
const BLACK = '#000000';

/** `wanted` if it reads on `background` at `ratio`, else white or black, whichever reads better. */
export function readable(wanted: string | null, background: string, ratio = 4.5): string {
  if (wanted && contrast(wanted, background) >= ratio) return wanted;
  return contrast(WHITE, background) >= contrast(BLACK, background) ? WHITE : BLACK;
}
