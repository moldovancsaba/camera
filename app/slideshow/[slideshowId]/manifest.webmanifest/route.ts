import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { slideshowManifest } from '@/lib/pwa/event-manifest';
import { findEventForSlideshow } from '@/lib/slideshow/resolve-event';
import { cachedStageTheme } from '@/lib/slideshow/stage-theme';

// WHAT: the web app manifest of one giant screen, public like the screen itself.
// WHY: "Add to Home Screen" opens the screen with no browser bars, which is the only full screen an iPhone has; see lib/pwa/event-manifest.ts `slideshowManifest`.
export async function GET(_request: Request, context: { params: Promise<{ slideshowId: string }> }) {
  const { slideshowId } = await context.params;
  const db = await connectToDatabase();
  const slideshow = await db.collection(COLLECTIONS.SLIDESHOWS).findOne({ slideshowId }, { projection: { name: 1, eventId: 1 } });
  const event = slideshow ? await findEventForSlideshow(db, String(slideshow.eventId)) : null;
  if (!slideshow || !event) return NextResponse.json({ error: 'Slideshow not found' }, { status: 404 });
  const theme = await cachedStageTheme(db, event as unknown as Record<string, unknown>);
  return new NextResponse(JSON.stringify(slideshowManifest(slideshow, event as unknown as Record<string, unknown>, slideshowId, theme)), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
