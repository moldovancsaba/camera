import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export interface SlideshowEditorInitialValue {
  _id: string;
  slideshowId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  bufferSize?: number;
  transitionDurationMs?: number;
  fadeDurationMs?: number;
  refreshStrategy?: 'continuous' | 'batch';
  playMode?: 'once' | 'loop';
  orderMode?: 'fixed' | 'random';
  backgroundPrimaryColor?: string;
  backgroundAccentColor?: string;
  backgroundImageUrl?: string | null;
  viewportScale?: 'fit' | 'fill';
  stageAspect?: number | null;
  submissionSourceMode?: 'originals_only' | 'approved_tryon_only' | 'originals_and_approved_tryon';
}

export interface SlideshowEditorPropsData {
  eventMongoId: string;
  eventUuid: string;
  eventName: string;
  slideshow: SlideshowEditorInitialValue | null;
}

export async function buildSlideshowEditorProps(
  eventMongoId: string,
  slideshowMongoId?: string
): Promise<SlideshowEditorPropsData | null> {
  if (!ObjectId.isValid(eventMongoId)) return null;

  const db = await connectToDatabase();
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventMongoId) });

  if (!event) return null;

  const slideshow =
    slideshowMongoId && ObjectId.isValid(slideshowMongoId)
      ? await db
          .collection(COLLECTIONS.SLIDESHOWS)
          .findOne({
            _id: new ObjectId(slideshowMongoId),
            eventId: { $in: [String(event.eventId), eventMongoId] },
          })
      : null;

  return {
    eventMongoId,
    eventUuid: String(event.eventId),
    eventName: String(event.name),
    slideshow: slideshow
      ? {
          _id: String(slideshow._id),
          slideshowId: String(slideshow.slideshowId),
          name: String(slideshow.name),
          isActive: slideshow.isActive !== false,
          createdAt: String(slideshow.createdAt),
          bufferSize:
            typeof slideshow.bufferSize === 'number'
              ? slideshow.bufferSize
              : undefined,
          transitionDurationMs:
            typeof slideshow.transitionDurationMs === 'number'
              ? slideshow.transitionDurationMs
              : undefined,
          fadeDurationMs:
            typeof slideshow.fadeDurationMs === 'number'
              ? slideshow.fadeDurationMs
              : undefined,
          refreshStrategy:
            slideshow.refreshStrategy === 'batch' ? 'batch' : 'continuous',
          playMode: slideshow.playMode === 'once' ? 'once' : 'loop',
          orderMode: slideshow.orderMode === 'random' ? 'random' : 'fixed',
          backgroundPrimaryColor:
            (slideshow.backgroundPrimaryColor as string | undefined) ??
            '#312e81',
          backgroundAccentColor:
            (slideshow.backgroundAccentColor as string | undefined) ??
            '#0f172a',
          backgroundImageUrl:
            (slideshow.backgroundImageUrl as string | null | undefined) ?? '',
          viewportScale: slideshow.viewportScale === 'fill' ? 'fill' : 'fit',
          submissionSourceMode:
            slideshow.submissionSourceMode === 'approved_tryon_only'
              ? 'approved_tryon_only'
              : slideshow.submissionSourceMode === 'originals_and_approved_tryon'
                ? 'originals_and_approved_tryon'
                : 'originals_only',
          stageAspect:
            typeof slideshow.stageAspect === 'number'
              ? slideshow.stageAspect
              : slideshow.stageAspect === null
                ? null
                : undefined,
        }
      : null,
  };
}
