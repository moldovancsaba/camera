/**
 * Edit slideshow layout (grid + per-region slideshow assignment).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import { notFound } from 'next/navigation';
import SlideshowLayoutBuilder from '@/components/admin/SlideshowLayoutBuilder';
import {
  normalizeLayoutAlignHorizontal,
  normalizeLayoutAlignVertical,
  normalizeStoredSafetyColor,
} from '@/lib/slideshow/layout-presentation';
import { normalizeSlideshowLayoutCellAspect } from '@/lib/slideshow/viewport-scale';

export default async function EditSlideshowLayoutPage({
  params,
}: {
  params: Promise<{ id: string; layoutMongoId: string }>;
}) {
  const { id, layoutMongoId } = await params;

  if (!ObjectId.isValid(id) || !ObjectId.isValid(layoutMongoId)) {
    notFound();
  }

  const db = await connectToDatabase();
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(id) });

  if (!event) {
    notFound();
  }

  const layout = await db.collection(COLLECTIONS.SLIDESHOW_LAYOUTS).findOne({
    _id: new ObjectId(layoutMongoId),
    eventId: event.eventId,
  });

  if (!layout) {
    notFound();
  }

  const layoutRaw = layout as Record<string, unknown>;

  return (
    <main style={{ margin: '0 auto', maxWidth: 1280, padding: '2rem 1rem' }}>
      <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div>
      <h1 style={{ margin: 0 }}>
        Slideshow layout
      </h1>
      <p style={{ color: 'var(--gds-color-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
        Event: {event.name} · Assign each region to a slideshow, set delay offsets and fit/fill.
      </p>
      </div>
      <SlideshowLayoutBuilder
        layoutMongoId={layoutMongoId}
        eventMongoId={id}
        eventUuid={event.eventId}
        initialName={layout.name as string}
        initialRows={layout.rows as number}
        initialCols={layout.cols as number}
        initialAreas={JSON.parse(JSON.stringify(layout.areas || []))}
        initialBackground={(layout.background as string) || ''}
        initialAlignVertical={normalizeLayoutAlignVertical(
          layoutRaw.alignVertical
        )}
        initialAlignHorizontal={normalizeLayoutAlignHorizontal(
          layoutRaw.alignHorizontal
        )}
        initialSafetyPrimaryColor={normalizeStoredSafetyColor(
          layoutRaw.safetyPrimaryColor
        )}
        initialSafetyAccentColor={normalizeStoredSafetyColor(
          layoutRaw.safetyAccentColor
        )}
        initialCellAspect={normalizeSlideshowLayoutCellAspect(
          layoutRaw.cellAspect
        )}
      />
      </div>
    </main>
  );
}
