/**
 * What the generated default frame of an event is built from (docs/DEFAULT_FRAME_PLAN.md, camera#234): the
 * snapshot of messmass data (event, teams, partner, theme) or, for an event without a messmass link, a
 * fallback made from camera's own data. The messmass answer is untrusted input, so it is parsed
 * defensively; the hash covers only what changes the rendered image, so a refresh can tell "changed" from
 * "fetched again". Server side only (node:crypto).
 */

import { createHash } from 'node:crypto';
import { FRAME_SYSTEM_BAR_COLOR, FRAME_SYSTEM_HEADING_COLOR } from '@/lib/gds/tokens/colors';
import type { LayerId } from './layout';

export interface FrameTeam {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
}

export type FontSource = 'google' | 'custom' | 'system';

export interface FrameContext {
  /** `messmass` when the snapshot came from messmass, `camera` for the fallback built from camera's own data. */
  source: 'messmass' | 'camera';
  fetchedAt: string;
  /** Hash of what changes the rendered frame. */
  inputHash: string;
  event: { name: string; date: string | null; homeTeam: FrameTeam | null; visitorTeam: FrameTeam | null };
  /** The home team, or the event's own partner; its logo is the logo of the frame. */
  partner: { name: string; logoUrl: string | null } | null;
  /** Informational: which report template applies in messmass. */
  template: { name: string; resolvedFrom: string } | null;
  style: {
    name: string;
    resolvedFrom: string;
    fontFamily: string;
    fontSource: FontSource;
    /** Path on the messmass origin of a custom font file; null for any other font. */
    fontFile: string | null;
    /** #RRGGBBAA. */
    headingColor: string;
    heroBackground: string;
  };
}

/** One generated image of the frame: the same layers with one message (camera#235). */
export interface FrameVariant {
  /** Position in the event's message list; null for the single frame without a message. */
  index: number | null;
  /** The filled message that is drawn, or null for a frame without a message layer. */
  message: string | null;
  imageUrl: string;
  width: number;
  height: number;
  /** The boxes of the layers, in drawing order, for the live-view territories. */
  layers: Array<{ id: LayerId; x: number; y: number; width: number; height: number }>;
  /** Hash of everything that decides the image; an unchanged key means the stored image is reused. */
  key: string;
  font: { family: string; used: 'bundled' | 'custom' | 'fallback'; note: string | null; retry: boolean };
  /**
   * `drawn`: the partner's logo; `emoji`: the partner has no logo, so the event's own emoji is drawn in its place (camera#274);
   * `none`: no logo and no emoji; `failed`: the logo could not be fetched or decoded (retried at the next generation; the emoji
   * is drawn meanwhile when there is one).
   */
  logo: 'drawn' | 'emoji' | 'none' | 'failed';
  /** The drawing code this image was made with (FRAME_RENDER_VERSION); an older one is redrawn by the rollout's "redraw" run. Absent on the first images. */
  renderVersion?: number;
}

export interface FrameDesign {
  context: FrameContext;
  /** The editable message list (lib/frame/messages.ts); the default list while `messagesOverridden` is false. */
  messages: string[];
  messagesOverridden: boolean;
  updatedAt: string;
  /** One image per usable message (camera#235); absent until the first generation. */
  variants?: FrameVariant[];
  generatedAt?: string;
}

const TEXT_MAX = 200;
const COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONT_FILE = /^\/fonts\/[A-Za-z0-9._ -]+\.(?:woff2?|ttf|otf)$/;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, TEXT_MAX) : null;
}

/** https only: the logo is fetched by our renderer. */
function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

/** A colour we can draw, normalised to lower case; anything else falls back to `fallback`. */
function colour(value: unknown, fallback: string): string {
  const raw = text(value);
  return raw && COLOUR.test(raw) ? raw.toLowerCase() : fallback;
}

function team(value: unknown): FrameTeam | null {
  const t = record(value);
  const name = text(t?.name);
  if (!t || !name) return null;
  return { id: text(t.id) ?? '', name, shortName: text(t.shortName), logoUrl: httpsUrl(t.logoUrl) };
}

export function contextHash(context: Pick<FrameContext, 'event' | 'partner' | 'style'>): string {
  const rendered = {
    name: context.event.name,
    home: context.event.homeTeam?.name ?? null,
    visitor: context.event.visitorTeam?.name ?? null,
    partner: context.partner ? [context.partner.name, context.partner.logoUrl] : null,
    font: [context.style.fontFamily, context.style.fontSource, context.style.fontFile],
    colours: [context.style.headingColor, context.style.heroBackground],
  };
  return createHash('sha256').update(JSON.stringify(rendered)).digest('hex');
}

/** The messmass frame-context answer as a snapshot; null when it is not usable (no event name or no style). */
export function parseFrameContext(input: unknown, now: string): FrameContext | null {
  const root = record(input);
  const event = record(root?.event);
  const style = record(root?.style);
  const name = text(event?.name);
  if (!root || !event || !style || !name) return null;

  const partner = record(root.partner);
  const partnerName = text(partner?.name);
  const template = record(root.template);
  const fontSource = style.fontSource === 'google' || style.fontSource === 'custom' ? style.fontSource : 'system';
  const fontFile = typeof style.fontFile === 'string' && FONT_FILE.test(style.fontFile) && !style.fontFile.includes('..') ? style.fontFile : null;

  const context: Omit<FrameContext, 'inputHash'> = {
    source: 'messmass',
    fetchedAt: now,
    event: { name, date: text(event.date), homeTeam: team(event.homeTeam), visitorTeam: team(event.visitorTeam) },
    partner: partner && partnerName ? { name: partnerName, logoUrl: httpsUrl(partner.logoUrl) } : null,
    template: template ? { name: text(template.name) ?? 'Template', resolvedFrom: text(template.resolvedFrom) ?? 'unknown' } : null,
    style: {
      name: text(style.name) ?? 'Style',
      resolvedFrom: text(style.resolvedFrom) ?? 'unknown',
      fontFamily: text(style.fontFamily) ?? 'Inter',
      fontSource,
      fontFile: fontSource === 'custom' ? fontFile : null,
      headingColor: colour(style.headingColor, FRAME_SYSTEM_HEADING_COLOR),
      heroBackground: colour(style.heroBackground, FRAME_SYSTEM_BAR_COLOR),
    },
  };
  return { ...context, inputHash: contextHash(context) };
}

/** For an event with no messmass link, or while messmass has not answered: camera's own name and partner logo, no teams, the system theme. */
export function nativeFrameContext(
  input: { eventName: string; eventDate?: string | null; partnerName?: string | null; partnerLogoUrl?: string | null },
  now: string
): FrameContext {
  const partnerName = text(input.partnerName);
  const context: Omit<FrameContext, 'inputHash'> = {
    source: 'camera',
    fetchedAt: now,
    event: { name: text(input.eventName) ?? 'Event', date: text(input.eventDate), homeTeam: null, visitorTeam: null },
    partner: partnerName ? { name: partnerName, logoUrl: httpsUrl(input.partnerLogoUrl) } : null,
    template: null,
    style: {
      name: 'System default',
      resolvedFrom: 'system-default',
      fontFamily: 'Inter',
      fontSource: 'google',
      fontFile: null,
      headingColor: FRAME_SYSTEM_HEADING_COLOR,
      heroBackground: FRAME_SYSTEM_BAR_COLOR,
    },
  };
  return { ...context, inputHash: contextHash(context) };
}
