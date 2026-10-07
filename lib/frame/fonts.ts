/**
 * Fonts of the generated frame (docs/DEFAULT_FRAME_PLAN.md, camera#235). The four Google fonts messmass offers and
 * the colour emoji font are bundled in assets/frame-fonts (all SIL OFL, licences next to them); a custom partner font
 * is fetched from messmass at render time, server to server, kept in memory only and never stored in camera. Any
 * font that cannot be had falls back to Inter. Server side only. Registration is process wide, hence one alias per font.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { messmassFontUrl } from '@/lib/messmassClient';
import type { FrameContext } from './context';

export const FRAME_FONT_DIR = path.join(process.cwd(), 'assets', 'frame-fonts');

// Static bold files, not the variable fonts: every message and team name is drawn at weight 700, and the canvas renderer ignores the weight
// of a variable font (it draws its default instance: regular for Inter and Roboto, even thin for Montserrat), so the bold has to be a font of its own.
const BUNDLED: Record<string, string> = {
  inter: 'Inter-Bold.ttf',
  roboto: 'Roboto-Bold.ttf',
  poppins: 'Poppins-Bold.ttf',
  montserrat: 'Montserrat-Bold.ttf',
};
const FALLBACK = 'inter';
export const EMOJI_ALIAS = 'frame-emoji';
const FONT_FILE = /^\/fonts\/[A-Za-z0-9._ -]+\.(?:woff2?|ttf|otf)$/;
const FONT_MAX_BYTES = 3 * 1024 * 1024;
const FONT_FETCH_TIMEOUT_MS = 5000;

export interface ResolvedFont {
  family: string;
  /** The canvas font-family list: the font, then Inter, then the emoji font. */
  stack: string;
  used: 'bundled' | 'custom' | 'fallback';
  /** Why Inter is used instead of the wanted font, or null. */
  note: string | null;
  /** True when a fetch failed (worth trying again at the next generation); false when the font simply is not available. */
  retry: boolean;
}

const registered = new Set<string>();

function registerBundled(alias: string, file: string): boolean {
  if (registered.has(alias)) return true;
  const key = GlobalFonts.registerFromPath(path.join(FRAME_FONT_DIR, file), alias);
  if (key) registered.add(alias);
  return Boolean(key);
}

function stackOf(alias: string): string {
  return `"${alias}", "frame-${FALLBACK}", "${EMOJI_ALIAS}"`;
}

/** The colour emoji font is large, so it is registered only when some text contains an emoji. */
export function ensureEmojiFont(text: string): void {
  if (/\p{Extended_Pictographic}/u.test(text)) registerBundled(EMOJI_ALIAS, 'NotoColorEmoji.woff2');
}

const downloaded = new Map<string, Buffer>();

/** A custom font file from the messmass origin; null on any failure (unconfigured, refused, too large, slow). */
export async function fetchMessmassFont(fontPath: string, fetchImpl: typeof fetch = fetch): Promise<Buffer | null> {
  const url = FONT_FILE.test(fontPath) ? messmassFontUrl(fontPath) : null;
  if (!url) return null;
  const cached = downloaded.get(url);
  if (cached) return cached;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS), redirect: 'error' });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > FONT_MAX_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > FONT_MAX_BYTES) return null;
    downloaded.set(url, bytes);
    return bytes;
  } catch {
    return null;
  }
}

export async function resolveFrameFont(
  style: FrameContext['style'],
  deps: { fetchFont?: (fontPath: string) => Promise<Buffer | null> } = {}
): Promise<ResolvedFont> {
  if (!registerBundled(`frame-${FALLBACK}`, BUNDLED[FALLBACK])) throw new Error('The bundled fallback font could not be registered');
  const fallback = (note: string | null, retry = false): ResolvedFont => ({
    family: `frame-${FALLBACK}`,
    stack: stackOf(`frame-${FALLBACK}`),
    used: 'fallback',
    note,
    retry,
  });

  const name = style.fontFamily.trim().toLowerCase();
  const bundled = BUNDLED[name];
  if (bundled) {
    const alias = `frame-${name}`;
    return registerBundled(alias, bundled)
      ? { family: alias, stack: stackOf(alias), used: 'bundled', note: null, retry: false }
      : fallback(`font "${style.fontFamily}" could not be registered`);
  }

  if (style.fontSource === 'custom') {
    if (!style.fontFile) return fallback(`custom font "${style.fontFamily}" has no file`);
    const bytes = await (deps.fetchFont ?? fetchMessmassFont)(style.fontFile);
    if (!bytes) return fallback(`custom font "${style.fontFamily}" could not be fetched`, true);
    const alias = `frame-custom-${createHash('sha1').update(`${style.fontFile}:${bytes.length}`).digest('hex').slice(0, 12)}`;
    if (!registered.has(alias)) {
      if (!GlobalFonts.register(bytes, alias)) return fallback(`custom font "${style.fontFamily}" could not be registered`);
      registered.add(alias);
    }
    return { family: alias, stack: stackOf(alias), used: 'custom', note: null, retry: false };
  }

  return fallback(`font "${style.fontFamily}" is not available`);
}
