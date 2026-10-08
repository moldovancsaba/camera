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

/** `top` over `below` at `amount` (0 to 1), as an opaque #RRGGBB; `below` when `top` is not a colour. Used for the dimmed shades of a text colour. */
export function mix(top: string, below: string, amount: number): string {
  const a = parseColour(top);
  const b = parseColour(below);
  if (!a || !b) return below;
  const m = (x: number, y: number) => x * amount + y * (1 - amount);
  return toHex({ r: m(a.rgb.r, b.rgb.r), g: m(a.rgb.g, b.rgb.g), b: m(a.rgb.b, b.rgb.b) });
}

const WHITE = '#ffffff';
const BLACK = '#000000';
/** One step of the repair of a colour: 5% of the way to black (darker) or to white (lighter). */
const REPAIR_STEP = 0.05;
const REPAIR_STEPS = 19;

const shade = ({ r, g, b }: Rgb, toward: 'darker' | 'lighter', amount: number): Rgb =>
  toward === 'darker'
    ? { r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) }
    : { r: r + (255 - r) * amount, g: g + (255 - g) * amount, b: b + (255 - b) * amount };

/**
 * The colour itself when it reads on every background at `ratio`, else the nearest variant of it that does: the same hue, darker or lighter in
 * steps of 5% (camera#336). Null when `wanted` is not a colour or no variant passes. The smallest change wins; at the same size, darker.
 */
export function repaired(wanted: string | null | undefined, backgrounds: readonly string[], ratio = 4.5): string | null {
  const parsed = parseColour(wanted);
  if (!parsed) return null;
  const passes = (colour: string) => backgrounds.every((background) => contrast(colour, background) >= ratio);
  for (let step = 0; step <= REPAIR_STEPS; step++) {
    for (const toward of ['darker', 'lighter'] as const) {
      const candidate = toHex(shade(parsed.rgb, toward, step * REPAIR_STEP));
      if (passes(candidate)) return candidate;
      if (step === 0) break;
    }
  }
  return null;
}

/** White or black, whichever reads better on the backgrounds: the last resort when no variant of a colour can pass. */
export function bestOfWhiteOrBlack(backgrounds: readonly string[]): string {
  const worst = (colour: string) => Math.min(...backgrounds.map((background) => contrast(colour, background)));
  return worst(WHITE) >= worst(BLACK) ? WHITE : BLACK;
}

/** `wanted` if it reads on `background` at `ratio`; else its nearest readable variant (same hue); only when none exists, white or black. */
export function readable(wanted: string | null, background: string, ratio = 4.5): string {
  return repaired(wanted, [background], ratio) ?? bestOfWhiteOrBlack([background]);
}
