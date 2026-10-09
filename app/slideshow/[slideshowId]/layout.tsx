import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import EventThemeScope from '@/components/theme/EventThemeScope';
import { pwaPageColor, pwaShortName } from '@/lib/pwa/event-manifest';
import { findEventForSlideshow } from '@/lib/slideshow/resolve-event';
import { cachedStageTheme } from '@/lib/slideshow/stage-theme';
import type { EventTheme } from '@/lib/theme/event-theme';

/** The slideshow, its event and the event's theme; null when the slideshow is not found (the player then says so itself). */
async function loadScreen(slideshowId: string): Promise<{ name: string; brandColor: unknown; theme: EventTheme | null } | null> {
  try {
    const db = await connectToDatabase();
    const slideshow = await db.collection(COLLECTIONS.SLIDESHOWS).findOne({ slideshowId }, { projection: { name: 1, eventId: 1 } });
    const event = slideshow ? await findEventForSlideshow(db, String(slideshow.eventId)) : null;
    if (!slideshow || !event) return null;
    const theme = await cachedStageTheme(db, event as unknown as Record<string, unknown>);
    return { name: String(slideshow.name ?? event.name ?? 'Screen'), brandColor: (event as { brandColor?: unknown }).brandColor, theme };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slideshowId: string }> }): Promise<Metadata> {
  const { slideshowId } = await params;
  const screen = await loadScreen(slideshowId);
  const name = screen?.name ?? 'Screen';
  return {
    title: { absolute: name },
    robots: { index: false, follow: false },
    // Installable (issue 487): from the Home Screen the screen opens with no browser bars, the only full screen an iPhone has.
    manifest: `/slideshow/${slideshowId}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: pwaShortName(name), statusBarStyle: 'black-translucent' },
    // iOS Safari looks for Apple's own tag; Next emits only the standard one for `capable`.
    other: { 'apple-mobile-web-app-capable': 'yes' },
  };
}

// viewport-fit=cover: the screen's colours reach every edge of the phone, so no band of another colour shows beside a picture held sideways.
export async function generateViewport({ params }: { params: Promise<{ slideshowId: string }> }): Promise<Viewport> {
  const { slideshowId } = await params;
  const screen = await loadScreen(slideshowId);
  return { viewportFit: 'cover', themeColor: pwaPageColor(screen?.theme, screen?.brandColor) };
}

// Everything behind the screen is in the event's colours, the page and the browser's own bars (CLAUDE.md section 7: a partner's and an event's content never shows the default white).
export default async function SlideshowLayout({ children, params }: { children: ReactNode; params: Promise<{ slideshowId: string }> }) {
  const { slideshowId } = await params;
  const screen = await loadScreen(slideshowId);
  if (!screen?.theme) return children;
  return <EventThemeScope theme={screen.theme}>{children}</EventThemeScope>;
}
