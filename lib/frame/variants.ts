/**
 * Generates the images of an event's default frame: one transparent 1920x1080 PNG per usable message, stored in
 * Vercel Blob, with the layer boxes kept for the live-view territories (docs/DEFAULT_FRAME_PLAN.md, camera#235).
 * An image is reused while everything that decides it is unchanged. Old files are never deleted: a submission
 * records the variant it used and try-on composes with that URL later. Dependencies are injected so it is
 * unit-tested without Blob or a network.
 */

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import type { Db, Document } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { baseImageFor, parseFrameBase, renderBaseFrame } from './base';
import { contextHash, type FrameDesign, type FrameVariant } from './context';
import { resolveFrameFont, type ResolvedFont } from './fonts';
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, layerBoxes } from './layout';
import { fetchLogo } from './logo';
import { eventEmoji, withoutEmoji } from './emoji';
import { chosenFrameId, frameBaseOf, loadMessageFrames, type MessageFrame } from './message-frames';
import { messageTokens, usableMessages } from './messages';
import { FRAME_RENDER_VERSION, renderFrame } from './render';

export interface VariantDeps {
  upload: (pathname: string, png: Buffer) => Promise<string>;
  fetchLogo: (url: string) => Promise<Buffer | null>;
  /** The designers' base picture of a frame (lib/frame/base.ts); fetched like a logo (https, an allowed host, size capped). */
  fetchBaseImage: (url: string) => Promise<Buffer | null>;
  resolveFont: (style: FrameDesign['context']['style']) => Promise<ResolvedFont>;
  now: () => string;
}

const defaultDeps: VariantDeps = {
  upload: async (pathname, png) =>
    (await put(pathname, png, { access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 })).url,
  fetchLogo,
  fetchBaseImage: (url) => fetchLogo(url),
  resolveFont: (style) => resolveFrameFont(style),
  now: () => new Date().toISOString(),
};

export interface GenerateResult {
  design: FrameDesign;
  generated: number;
  reused: number;
}

/** Everything that decides the image: what is drawn, the message, the font actually used, the size and the drawing code. */
export function variantKey(design: FrameDesign, message: string | null, font: ResolvedFont, frame?: MessageFrame): string {
  const decides: unknown[] = [contextHash(design.context), message, font.family, font.used, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT, FRAME_RENDER_VERSION];
  // The frame a message chose (camera#366) decides the image, and the older base picture does not apply to that message. A base picture changes the image;
  // a design with neither keeps the key it always had, so nothing is redrawn.
  if (frame) decides.push({ frame: frame.frameId, imageUrl: frame.imageUrl, area: frame.area });
  else if (design.base) decides.push(design.base);
  return createHash('sha256').update(JSON.stringify(decides)).digest('hex');
}

/** A stored image can be reused when its key is unchanged and it was not a result of a failure that is worth retrying. */
const reusable = (variant: FrameVariant, key: string) => variant.key === key && variant.logo !== 'failed' && !variant.font.retry;

export async function generateFrameVariants(db: Db, event: Document, deps: VariantDeps = defaultDeps): Promise<GenerateResult> {
  const design = event.frameDesign as FrameDesign | undefined;
  if (!design?.context) throw new Error('The frame design has no snapshot yet');

  const { context } = design;
  // The placeholders name the sides the frame shows (the pairing in the event name when the home partner is a competition).
  // No partner logo: the event's emoji is drawn as the logo and taken out of the name (camera#274), so a message that uses the
  // name does not carry it either. A partner with a logo keeps the name as it is.
  const emoji = context.partner?.logoUrl ? null : eventEmoji(context.event, context.partner?.name);
  const shown = emoji ? { ...context, event: { ...context.event, name: withoutEmoji(context.event.name, emoji) } } : context;
  const usable = usableMessages(
    design.messages,
    messageTokens({ home: shown.event.homeTeam?.name, visitor: shown.event.visitorTeam?.name, eventName: shown.event.name })
  );
  // No usable message: one frame without a message layer, so the event still has its frame.
  const jobs = usable.length > 0 ? usable.map((m) => ({ index: m.index as number | null, message: m.text as string | null })) : [{ index: null, message: null }];

  const font = await deps.resolveFont(context.style);
  const existing = design.variants ?? [];
  const variants: FrameVariant[] = [];
  let logoBytes: Buffer | null | undefined;
  const base = parseFrameBase(design.base);
  const baseBytes = new Map<string, Buffer>();
  // The frames the messages chose: only those of the event that can still carry a message; a message whose frame is gone keeps the older picture or the layout.
  const chosenFrames = Object.keys(design.messageFrames ?? {}).length > 0 ? await loadMessageFrames(db, event) : new Map<string, MessageFrame>();
  let generated = 0;

  for (const job of jobs) {
    const frameId = chosenFrameId(design, job.index);
    const chosen = frameId ? chosenFrames.get(frameId) : undefined;
    const key = variantKey(design, job.message, font, chosen);
    const kept = existing.find((variant) => reusable(variant, key));
    if (kept) {
      variants.push({ ...kept, index: job.index });
      continue;
    }

    if (chosen) {
      // A frame of the library with a message area: its picture, with the message written in the event's font; a picture that cannot be fetched fails the run and leaves the images as they were.
      let bytes = baseBytes.get(chosen.imageUrl);
      if (!bytes) {
        bytes = (await deps.fetchBaseImage(chosen.imageUrl)) ?? undefined;
        if (!bytes) throw new Error(`The picture of the frame "${chosen.name}" could not be fetched`);
        baseBytes.set(chosen.imageUrl, bytes);
      }
      const rendered = await renderBaseFrame({ base: frameBaseOf(chosen), imageBytes: bytes, message: job.message, font });
      const imageUrl = await deps.upload(`frames/generated/${event.eventId}/${key.slice(0, 32)}.png`, rendered.png);
      variants.push({
        index: job.index,
        message: job.message,
        imageUrl,
        width: rendered.width,
        height: rendered.height,
        layers: rendered.layers,
        key,
        font: { family: font.family, used: font.used, note: font.note, retry: font.retry },
        logo: 'none',
        renderVersion: FRAME_RENDER_VERSION,
        frameId: chosen.frameId,
      });
      generated += 1;
      continue;
    }

    if (base) {
      // The designers' picture, with the message written in the event's font; a picture that cannot be fetched fails the run and leaves the images as they were.
      const picture = baseImageFor(base, job.message);
      let bytes = baseBytes.get(picture.imageUrl);
      if (!bytes) {
        bytes = (await deps.fetchBaseImage(picture.imageUrl)) ?? undefined;
        if (!bytes) throw new Error('The base picture of the frame could not be fetched');
        baseBytes.set(picture.imageUrl, bytes);
      }
      const rendered = await renderBaseFrame({ base, imageBytes: bytes, message: job.message, font });
      const imageUrl = await deps.upload(`frames/generated/${event.eventId}/${key.slice(0, 32)}.png`, rendered.png);
      variants.push({
        index: job.index,
        message: job.message,
        imageUrl,
        width: rendered.width,
        height: rendered.height,
        layers: rendered.layers,
        key,
        font: { family: font.family, used: font.used, note: font.note, retry: font.retry },
        logo: 'none',
        renderVersion: FRAME_RENDER_VERSION,
      });
      generated += 1;
      continue;
    }

    if (logoBytes === undefined) logoBytes = context.partner?.logoUrl ? await deps.fetchLogo(context.partner.logoUrl) : null;
    const rendered = await renderFrame({ context: shown, message: job.message, logoBytes, emoji, font });
    const imageUrl = await deps.upload(`frames/generated/${event.eventId}/${key.slice(0, 32)}.png`, rendered.png);
    variants.push({
      index: job.index,
      message: job.message,
      imageUrl,
      width: rendered.layout.width,
      height: rendered.layout.height,
      layers: layerBoxes(rendered.layout).map(({ id, rect }) => ({ id, ...rect })),
      key,
      font: { family: font.family, used: font.used, note: font.note, retry: font.retry },
      logo: rendered.logo,
      renderVersion: FRAME_RENDER_VERSION,
    });
    generated += 1;
  }

  const generatedAt = deps.now();
  const next: FrameDesign = { ...design, variants, generatedAt };
  // One write at the end: a failed upload above leaves the previous variants as they were.
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, { $set: { 'frameDesign.variants': variants, 'frameDesign.generatedAt': generatedAt } });
  return { design: next, generated, reused: variants.length - generated };
}
