import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { isPubliclyVisible, visibilityInputOf } from '@/lib/submissions/visibility';

export const dynamic = 'force-dynamic';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeFileName(value: string): string {
  const raw = value.trim();
  if (!raw) return 'shared-image.jpg';
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${cleaned}.jpg`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestedVariantId = readString(request.nextUrl.searchParams.get('variant'));
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid share id' }, { status: 400 });
    }
    if (!requestedVariantId) {
      return NextResponse.json({ error: 'Missing variant identifier' }, { status: 400 });
    }

    const db = await connectToDatabase();
    const doc = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: new ObjectId(id) });
    // A photo that is not public (pending, rejected, archived, removed from its events) cannot be downloaded: the same answer as
    // an unknown id (camera#262).
    if (!doc || typeof doc !== 'object' || !isPubliclyVisible(visibilityInputOf(doc))) {
      return NextResponse.json({ error: 'Share submission not found' }, { status: 404 });
    }

    // The one downloadable picture of a share page is the photo itself, offered as `<id>:camera-result` (the link the page carries). The page also
    // offered the approved try-on pictures of the photo until the try-on integration was removed (issue 557); a stored try-on result is not
    // public (the rule above), so it has no download.
    const imageUrl = requestedVariantId === `${String(doc._id)}:camera-result` ? readString(doc.imageUrl) : null;
    if (!imageUrl) {
      return NextResponse.json({ error: 'No downloadable image available' }, { status: 404 });
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image (${imageResponse.status})` },
        { status: 502 }
      );
    }

    const contentType = imageResponse.headers.get('content-type') ?? 'application/octet-stream';
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${sanitizeFileName(requestedVariantId)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });

    const contentLength = imageResponse.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    if (!imageResponse.body) {
      const buffer = await imageResponse.arrayBuffer();
      return new NextResponse(buffer, { headers });
    }

    return new NextResponse(imageResponse.body, { headers });
  } catch (error) {
    console.error('Error downloading share image:', error);
    return NextResponse.json({ error: 'Failed to download image' }, { status: 500 });
  }
}
