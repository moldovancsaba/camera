/**
 * Generates assigned message-frame compositions and, when requested, the event's optional default layout: one
 * 1920x1080 PNG per usable message/design pair, stored in Vercel Blob, with layer boxes for live-view territories.
 * An image is reused while everything that decides it is unchanged. Old files are never deleted: a submission
 * records the variant it used. Dependencies are injected so it is
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
import { chosenFrameIds, frameBaseOf, loadMessageFrames, type MessageFrame } from './message-frames';
import { messageTokens, usableMessages } from './messages';
import { effectiveMessageFrames } from './selection';
import { FRAME_RENDER_VERSION, generatedLayers, renderFrame, renderSlotFrame, slotLayers } from './render';
import { slotLayerBoxes } from './slot-layout';
import { scheduleWelcomeRedraw } from '@/lib/screen/welcome-redraw';
import { resolveSlotPictures, slotsForMessage, type SlotPosition } from './slots';
import { loadInheritedSlots } from './slots-inherit';

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

/**
 * What the frame draws of the event: with no partner logo the event's emoji is drawn as the logo and taken out of the name (camera#274), so a message that uses the name does not
 * carry it either. A partner with a logo keeps the name as it is.
 */
export function shownContext(context: FrameDesign['context']): { shown: FrameDesign['context']; emoji: string | null } {
  const emoji = context.partner?.logoUrl ? null : eventEmoji(context.event, context.partner?.name);
  return { shown: emoji ? { ...context, event: { ...context.event, name: withoutEmoji(context.event.name, emoji) } } : context, emoji };
}

export interface GenerateResult {
  design: FrameDesign;
  generated: number;
  reused: number;
}

export interface GenerateOptions {
  /** Keep the event's optional default layout out while still drawing assigned message-frame combinations. */
  includeGeneratedFallback?: boolean;
}

/** Everything that decides the image: what is drawn, the message, the font actually used, the size and the drawing code. */
export function variantKey(design: FrameDesign, message: string | null, font: ResolvedFont, frame?: MessageFrame, template: string | null = null): string {
  const decides: unknown[] = [contextHash(design.context), message, font.family, font.used, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT, FRAME_RENDER_VERSION];
  // The frame a message chose (camera#366) decides the image, and the older base picture does not apply to that message. A base picture changes the image;
  // a design with neither keeps the key it always had, so nothing is redrawn.
  if (frame) decides.push({ frame: frame.frameId, imageUrl: frame.imageUrl, area: frame.area });
  else if (design.base) decides.push(design.base);
  // The slots (issue 502) decide the image, with each picture slot reduced to the picture this message uses; a design without them keeps the key it always had.
  else if (design.slots) decides.push({ slots: slotsForMessage(design.slots, template) });
  return createHash('sha256').update(JSON.stringify(decides)).digest('hex');
}

/** A stored image can be reused when its key is unchanged and it was not a result of a failure that is worth retrying. */
const reusable = (variant: FrameVariant, key: string) => variant.key === key && variant.logo !== 'failed' && !variant.font.retry;

export async function generateFrameVariants(db: Db, event: Document, deps: VariantDeps = defaultDeps, options: GenerateOptions = {}): Promise<GenerateResult> {
  const storedDesign = event.frameDesign as FrameDesign | undefined;
  if (!storedDesign?.context) throw new Error('The frame design has no snapshot yet');
  const inferredFrames = effectiveMessageFrames(storedDesign);
  const design = storedDesign.messageFramesOverridden !== true && Object.keys(storedDesign.messageFrames ?? {}).length === 0 && Object.keys(inferredFrames).length > 0
    ? { ...storedDesign, messageFrames: inferredFrames }
    : storedDesign;

  const { context } = design;
  // The slots that draw this frame: the event's own, else the partner's default, else the general default (issue 502, segment 5); undefined is the generated layout of the default frame. Never stored on the event.
  const slots = design.slots ?? (await loadInheritedSlots(db, event)).slots;
  // The placeholders name the sides the frame shows (the pairing in the event name when the home partner is a competition).
  // No partner logo: the event's emoji is drawn as the logo and taken out of the name (camera#274), so a message that uses the
  // name does not carry it either. A partner with a logo keeps the name as it is.
  const { shown, emoji } = shownContext(context);
  const usable = usableMessages(
    design.messages,
    messageTokens({ home: shown.event.homeTeam?.name, visitor: shown.event.visitorTeam?.name, eventName: shown.event.name })
  );
  const font = await deps.resolveFont(context.style);
  const existing = design.variants ?? [];
  const variants: FrameVariant[] = [];
  let logoBytes: Buffer | null | undefined;
  const base = parseFrameBase(design.base);
  const baseBytes = new Map<string, Buffer>();
  // The frames the messages chose: only assigned event frames that are active and can still carry a message.
  const chosenFrames = Object.keys(design.messageFrames ?? {}).length > 0 ? await loadMessageFrames(db, event) : new Map<string, MessageFrame>();
  let generated = 0;
  const includeGeneratedFallback = options.includeGeneratedFallback ?? true;

  // Draw each assigned message/design pair. The optional generated layout is a separate fallback: when it is off,
  // messages without an assigned carrier do not create a default frame image.
  type VariantJob = { index: number | null; message: string | null; chosen: MessageFrame | undefined };
  const jobs: VariantJob[] =
    usable.length > 0
      ? usable.flatMap<VariantJob>((m) => {
          const frames = chosenFrameIds(design, m.index).flatMap((id) => chosenFrames.get(id) ?? []);
          if (frames.length > 0) return frames.map((chosen) => ({ index: m.index, message: m.text, chosen }));
          return includeGeneratedFallback ? [{ index: m.index, message: m.text, chosen: undefined }] : [];
        })
      : includeGeneratedFallback ? [{ index: null, message: null, chosen: undefined }] : [];

  // The dark area of an image written on a library frame: the layers its designer put in the message area, or (`design.darkArea` is `generated`) the mask of the generated default frame for
  // that message. It is not part of the image, so a change of it does not redraw anything: kept images get their layers set again.
  // The pictures a message needs for the slots (issue 502): the one each picture slot maps it to, fetched once; a picture that cannot be fetched fails the run and leaves the images as they were.
  const slotPictures = async (template: string | null): Promise<Partial<Record<SlotPosition, Buffer>>> => {
    const out: Partial<Record<SlotPosition, Buffer>> = {};
    if (!slots) return out;
    for (const [position, image] of Object.entries(resolveSlotPictures(slots, template)) as Array<[SlotPosition, { key: string; imageUrl: string }]>) {
      let bytes = baseBytes.get(image.imageUrl);
      if (!bytes) {
        bytes = (await deps.fetchBaseImage(image.imageUrl)) ?? undefined;
        if (!bytes) throw new Error(`The picture "${image.key}" of the ${position.replace('-', ' ')} slot could not be fetched`);
        baseBytes.set(image.imageUrl, bytes);
      }
      out[position] = bytes;
    }
    return out;
  };
  const templateOf = (index: number | null): string | null => (index === null ? null : design.messages[index] ?? null);

  const layersOf = async (chosen: MessageFrame, message: string | null, own: FrameVariant['layers'], index: number | null): Promise<FrameVariant['layers']> => {
    if (design.darkArea !== 'generated') return own;
    if (logoBytes === undefined) logoBytes = context.partner?.logoUrl ? await deps.fetchLogo(context.partner.logoUrl) : null;
    // With slots the dark area is the mask of the slots, otherwise the mask of the generated default frame.
    if (slots) return slotLayers({ context: shown, message, logoBytes, emoji, font, slots, pictureBytes: await slotPictures(templateOf(index)) });
    return generatedLayers({ context: shown, message, logoBytes, emoji, font });
  };

  for (const job of jobs) {
    const chosen = job.chosen;
    const key = variantKey({ ...design, slots }, job.message, font, chosen, templateOf(job.index));
    const kept = existing.find((variant) => reusable(variant, key));
    if (kept) {
      variants.push({ ...kept, index: job.index, ...(chosen ? { layers: await layersOf(chosen, job.message, (chosen.area.layers ?? []).map((layer) => ({ ...layer })), job.index) } : {}) });
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
        layers: await layersOf(chosen, job.message, rendered.layers, job.index),
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
    if (slots) {
      // The slots (issue 502): the generated frame, composed from them.
      const rendered = await renderSlotFrame({ context: shown, message: job.message, logoBytes, emoji, font, slots, pictureBytes: await slotPictures(templateOf(job.index)) });
      const imageUrl = await deps.upload(`frames/generated/${event.eventId}/${key.slice(0, 32)}.png`, rendered.png);
      variants.push({
        index: job.index,
        message: job.message,
        imageUrl,
        width: rendered.layout.width,
        height: rendered.layout.height,
        layers: slotLayerBoxes(rendered.layout).map(({ id, rect }) => ({ id, ...rect })),
        key,
        font: { family: font.family, used: font.used, note: font.note, retry: font.retry },
        logo: rendered.logo,
        renderVersion: FRAME_RENDER_VERSION,
      });
      generated += 1;
      continue;
    }
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
  await db.collection(COLLECTIONS.EVENTS).updateOne({ _id: event._id }, {
    $set: {
      'frameDesign.variants': variants,
      'frameDesign.generatedAt': generatedAt,
      ...(storedDesign.messageFramesOverridden !== true && Object.keys(storedDesign.messageFrames ?? {}).length === 0 && Object.keys(inferredFrames).length > 0 ? { 'frameDesign.messageFrames': inferredFrames } : {}),
    },
  });
  // The welcome page screen shows this frame, in the colours and the font of the same snapshot (issue 327): when the event has that picture it is drawn again after the response, once, if anything it is
  // drawn from changed (lib/screen/welcome-redraw.ts; an event without the picture, a call outside a request and a switched-off redraw do nothing).
  scheduleWelcomeRedraw(event, 'frame');
  return { design: next, generated, reused: variants.length - generated };
}
