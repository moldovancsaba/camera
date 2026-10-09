/**
 * The welcome page screen picture of an event, drawn from its default slideshow and kept (issue 327, docs/BUILDING_BRICKS.md 6.2 parts 2 to 4): the screen design of the default
 * slideshow, the event's colours and font and its frame go in, one stored PNG comes out, `Event.welcomeScreen`. It is drawn again only when something it is drawn from changed (the
 * `key` is the hash of all of it), so asking again costs nothing. It lives next to the pages, never in them: **a page's own `screenImageUrl` is never touched** and always wins when
 * the page is shown. Dependencies are injected so it is unit-tested without Blob, a network or a database.
 *
 * Rule for when it is made (owner, 2026-10-09: "the welcome composition with the big screen has to use exactly the one created for the slideshow, so whenever a slideshow is updated, it
 * has to be updated as well"): it is drawn for a new event with its default slideshow, on request, and **every time the default slideshow is saved or made the default** (also for an event that
 * had none: saving the screen is the editor asking). A welcome page that has a picture of its own keeps it (an own picture on a page wins), so an event whose page should follow its screen has none.
 */

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';
import { ObjectId, type Db, type Document } from 'mongodb';
import { after } from 'next/server';
import { COLLECTIONS } from '@/lib/db/schemas';
import { connectToDatabase } from '@/lib/db/mongodb';
import { resolveFrameFont, type ResolvedFont } from '@/lib/frame/fonts';
import type { FrameDesign } from '@/lib/frame/context';
import { fetchLogo } from '@/lib/frame/logo';
import { findDefaultSlideshow } from '@/lib/slideshow/default-slideshow';
import { parseScreenDesign } from '@/lib/slideshow/screen-design';
import { loadEventTheme } from '@/lib/theme/load';
import { WELCOME_SCREEN_RENDER_VERSION, renderWelcomeScreen } from './welcome-screen';

export interface WelcomeScreenDeps {
  upload: (pathname: string, png: Buffer) => Promise<string>;
  /** An https image of an allowed host, or null (lib/frame/logo.ts). */
  fetchImage: (url: string) => Promise<Buffer | null>;
  resolveFont: (style: { fontFamily: string; fontSource: 'google' | 'custom' | 'system'; fontFile: string | null }) => Promise<ResolvedFont>;
  now: () => string;
}

const defaultDeps: WelcomeScreenDeps = {
  upload: async (pathname, png) => (await put(pathname, png, { access: 'public', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 })).url,
  fetchImage: (url) => fetchLogo(url),
  resolveFont: (style) => resolveFrameFont(style),
  now: () => new Date().toISOString(),
};

export type WelcomeScreenResult = { ok: true; url: string; created: boolean } | { ok: false; reason: string };

/** The frame the window shows: the event's frame without a message, else its first one. */
function frameImageUrl(event: Document): string | null {
  const variants = (event.frameDesign as FrameDesign | undefined)?.variants ?? [];
  return (variants.find((variant) => variant.index === null) ?? variants[0])?.imageUrl ?? null;
}

/** Draws the welcome page screen picture of the event unless the stored one is already drawn from the same things. */
export async function ensureWelcomeScreen(db: Db, event: Document, deps: WelcomeScreenDeps = defaultDeps): Promise<WelcomeScreenResult> {
  const eventUuid = String(event.eventId ?? '');
  if (!eventUuid) return { ok: false, reason: 'The event has no id.' };

  const slideshow = await findDefaultSlideshow(db, eventUuid);
  if (!slideshow) return { ok: false, reason: 'The event has no default slideshow.' };
  const parsed = parseScreenDesign(slideshow.screenDesign);
  if (!parsed.ok || !parsed.value) return { ok: false, reason: 'The default slideshow has no screen design.' };
  const design = parsed.value;

  const overlay = await deps.fetchImage(design.overlayImageUrl);
  if (!overlay) return { ok: false, reason: 'The overlay picture of the screen design could not be fetched.' };

  const theme = await loadEventTheme(db, event);
  const colours = { background: theme.background, accent: theme.buttonBackground };
  const font = await deps.resolveFont({ fontFamily: design.fontFamily ?? theme.font.family, fontSource: design.fontFamily ? 'google' : theme.font.source, fontFile: design.fontFamily ? null : theme.font.file });
  const frameUrl = frameImageUrl(event);

  const key = createHash('sha256').update(JSON.stringify([WELCOME_SCREEN_RENDER_VERSION, design, colours, font.family, font.used, frameUrl])).digest('hex');
  const stored = event.welcomeScreen as { url?: string; key?: string } | undefined;
  if (stored?.url && stored.key === key) return { ok: true, url: stored.url, created: false };

  const frame = frameUrl ? await deps.fetchImage(frameUrl) : null;
  const png = await renderWelcomeScreen({ design, overlay, windowPicture: null, frame, fontStack: font.stack, colours });
  const url = await deps.upload(`screens/${eventUuid}/welcome-${key.slice(0, 16)}.png`, png);
  await db.collection(COLLECTIONS.EVENTS).updateOne({ eventId: eventUuid }, { $set: { welcomeScreen: { url, key, generatedAt: deps.now(), renderVersion: WELCOME_SCREEN_RENDER_VERSION } } });
  return { ok: true, url, created: true };
}

/**
 * For after a response: loads the event as stored now and draws its picture (nothing is done again when what it is drawn from has not changed). A failure is logged, never thrown.
 */
export async function ensureWelcomeScreenLater(mongoId: ObjectId | string): Promise<void> {
  try {
    const db = await connectToDatabase();
    const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(String(mongoId)) });
    if (!event) return;
    const result = await ensureWelcomeScreen(db, event);
    if (!result.ok) console.warn('the welcome page screen could not be drawn', result.reason);
  } catch (error) {
    console.warn('the welcome page screen could not be drawn', error);
  }
}

/** Schedules `ensureWelcomeScreenLater` after the response; outside a request nothing is scheduled. */
export function scheduleWelcomeScreen(mongoId: ObjectId | string): void {
  try {
    after(() => ensureWelcomeScreenLater(mongoId));
  } catch {
    // not in a request: the picture is drawn when an admin asks for it
  }
}
