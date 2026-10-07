/**
 * The design of a giant screen (camera#309): a picture drawn over the stage with a transparent window where the photos play, a QR code made
 * by camera and a few short texts. Everything is placed in percentages of the stage, so it is the same on any screen size; the stage is
 * 16:9 like the picture the designers deliver (1920x1080). Stored on the slideshow as `screenDesign`, sanitised on the way in, and sent to the
 * player with the QR code already drawn (an SVG), so the player needs no QR code library.
 *
 * Pure, so it is unit-tested (screen-design.test.ts).
 */

import QRCode from 'qrcode';
import { CAMERA_STAGE_WHITE } from '@/lib/gds/tokens/colors';

export interface ScreenDesignText {
  text: string;
  /** Left edge and top edge, % of the stage width and height. */
  x: number;
  y: number;
  /** Box width, % of the stage width. */
  width: number;
  /** Font size, % of the stage height. */
  size: number;
  align: 'left' | 'center' | 'right';
  /** Hex colour; white when omitted. */
  color?: string;
}

export interface ScreenDesign {
  /** The picture drawn over the stage; transparent where the photos show. */
  overlayImageUrl: string;
  /** Where the photos play, % of the stage. */
  window: { left: number; top: number; width: number; height: number };
  photoFit: 'cover' | 'contain';
  /** A Google font for the texts, e.g. Roboto. */
  fontFamily?: string;
  /** The QR code: where it points, its top left corner (% of the stage) and its side (% of the stage width). */
  qr?: { url: string; x: number; y: number; size: number; color?: string };
  texts?: ScreenDesignText[];
}

/** What the player gets: the design and the QR code drawn as an SVG. */
export interface ResolvedScreenDesign extends ScreenDesign {
  qrSvg?: string;
}

const HEX = /^#[0-9a-f]{3,8}$/i;
const FONT = /^[A-Za-z0-9 ]{1,40}$/;
const MAX_TEXTS = 8;

type Result = { ok: true; value: ScreenDesign | null } | { ok: false; error: string };

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const isHttps = (v: unknown, max: number): v is string => {
  if (typeof v !== 'string' || v.length > max) return false;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

/** The design from a request, or why it is refused. `null` or an empty overlay removes the design. */
export function parseScreenDesign(input: unknown): Result {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'screenDesign must be an object or null' };
  const d = input as Record<string, unknown>;
  if (!isHttps(d.overlayImageUrl, 1000)) return { ok: false, error: 'screenDesign.overlayImageUrl must be an https address' };
  const w = (d.window ?? {}) as Record<string, unknown>;
  const win = { left: num(w.left, 0, 100), top: num(w.top, 0, 100), width: num(w.width, 1, 100), height: num(w.height, 1, 100) };
  if (win.left === null || win.top === null || win.width === null || win.height === null || win.left + win.width > 100.01 || win.top + win.height > 100.01) {
    return { ok: false, error: 'screenDesign.window must be left, top, width and height in percent, inside the stage' };
  }
  const out: ScreenDesign = {
    overlayImageUrl: d.overlayImageUrl,
    window: { left: win.left, top: win.top, width: win.width, height: win.height },
    photoFit: d.photoFit === 'contain' ? 'contain' : 'cover',
  };
  if (d.fontFamily !== undefined && d.fontFamily !== null && d.fontFamily !== '') {
    if (typeof d.fontFamily !== 'string' || !FONT.test(d.fontFamily)) return { ok: false, error: 'screenDesign.fontFamily must be a font name (letters, digits, spaces)' };
    out.fontFamily = d.fontFamily;
  }
  if (d.qr !== undefined && d.qr !== null) {
    const q = d.qr as Record<string, unknown>;
    const x = num(q.x, 0, 100), y = num(q.y, 0, 100), size = num(q.size, 2, 100);
    if (!isHttps(q.url, 300) || x === null || y === null || size === null || x + size > 100.01) return { ok: false, error: 'screenDesign.qr needs an https address, x, y and size in percent, inside the stage' };
    if (q.color !== undefined && q.color !== '' && !(typeof q.color === 'string' && HEX.test(q.color))) return { ok: false, error: 'screenDesign.qr.color must be a hex colour' };
    out.qr = { url: q.url, x, y, size, ...(q.color ? { color: String(q.color) } : {}) };
  }
  if (d.texts !== undefined && d.texts !== null) {
    if (!Array.isArray(d.texts) || d.texts.length > MAX_TEXTS) return { ok: false, error: `screenDesign.texts must be a list of at most ${MAX_TEXTS}` };
    out.texts = [];
    for (const raw of d.texts) {
      const t = (raw ?? {}) as Record<string, unknown>;
      const x = num(t.x, 0, 100), y = num(t.y, 0, 100), width = num(t.width, 1, 100), size = num(t.size, 0.5, 30);
      if (typeof t.text !== 'string' || !t.text.trim() || t.text.length > 120 || x === null || y === null || width === null || size === null) {
        return { ok: false, error: 'each screenDesign text needs a text (up to 120 characters), x, y, width and size in percent' };
      }
      if (t.color !== undefined && t.color !== '' && !(typeof t.color === 'string' && HEX.test(t.color))) return { ok: false, error: 'screenDesign text color must be a hex colour' };
      out.texts.push({ text: t.text.trim(), x, y, width, size, align: t.align === 'left' || t.align === 'right' ? t.align : 'center', ...(t.color ? { color: String(t.color) } : {}) });
    }
  }
  return { ok: true, value: out };
}

/** The QR code as an SVG of its dark modules only (the background shows through), runs merged so the markup stays small. */
export function qrSvg(url: string, color: string = CAMERA_STAGE_WHITE): string {
  const fill = HEX.test(color) ? color : CAMERA_STAGE_WHITE;
  const { size, data } = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; ) {
      if (!data[y * size + x]) { x += 1; continue; }
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run += 1;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><path fill="${fill}" d="${path}"/></svg>`;
}

export function resolveScreenDesign(stored: unknown): ResolvedScreenDesign | null {
  const parsed = parseScreenDesign(stored);
  if (!parsed.ok || !parsed.value) return null;
  const design: ResolvedScreenDesign = { ...parsed.value };
  if (design.qr) design.qrSvg = qrSvg(design.qr.url, design.qr.color);
  return design;
}
