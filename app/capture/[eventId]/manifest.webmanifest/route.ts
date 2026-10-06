import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { loadCaptureEvent } from '@/lib/events/capture-event';
import { eventManifest } from '@/lib/pwa/event-manifest';

// WHAT: the web app manifest of one event's capture flow (camera#222), public like the capture page itself.
// WHY: each event installs as its own app that opens at that event; see lib/pwa/event-manifest.ts.
export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await context.params;
  const event = ObjectId.isValid(eventId) ? await loadCaptureEvent(eventId) : null;
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  return new NextResponse(JSON.stringify(eventManifest(event, eventId)), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // An event rename or new brand colour reaches installed apps within minutes, not a year.
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
