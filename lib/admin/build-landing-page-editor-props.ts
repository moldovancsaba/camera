import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export interface LandingPageEditorOption {
  id: string;
  name: string;
}

export interface LandingPageEditorLogo {
  logoId: string;
  name: string;
  imageUrl: string;
}

export interface LandingPageEditorInitialValue {
  _id: string;
  slug: string;
  title?: string | null;
  description?: string | null;
  logoId?: string | null;
  qrCodeImageUrl?: string | null;
  url?: string | null;
  termsMarkdown?: string | null;
  termsFileName?: string | null;
  privacyMarkdown?: string | null;
  privacyFileName?: string | null;
  cookieConsentEnabled: boolean;
  targetType: 'slideshow' | 'layout';
  targetId: string;
  isActive: boolean;
}

export interface LandingPageEditorPropsData {
  eventMongoId: string;
  eventName: string;
  slideshows: LandingPageEditorOption[];
  layouts: LandingPageEditorOption[];
  logos: LandingPageEditorLogo[];
  landingPage: LandingPageEditorInitialValue | null;
}

export async function buildLandingPageEditorProps(
  eventMongoId: string,
  landingPageMongoId?: string
): Promise<LandingPageEditorPropsData | null> {
  if (!ObjectId.isValid(eventMongoId)) return null;

  const db = await connectToDatabase();
  const event = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ _id: new ObjectId(eventMongoId) });

  if (!event) return null;

  const [slideshows, layouts, logos, landingPage] = await Promise.all([
    db
      .collection(COLLECTIONS.SLIDESHOWS)
      .find({ eventId: event.eventId })
      .sort({ createdAt: -1 })
      .toArray(),
    db
      .collection(COLLECTIONS.SLIDESHOW_LAYOUTS)
      .find({ eventId: event.eventId })
      .sort({ createdAt: -1 })
      .toArray(),
    db
      .collection(COLLECTIONS.LOGOS)
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    landingPageMongoId && ObjectId.isValid(landingPageMongoId)
      ? db
          .collection(COLLECTIONS.LANDING_PAGES)
          .findOne({ _id: new ObjectId(landingPageMongoId), eventMongoId })
      : Promise.resolve(null),
  ]);

  return {
    eventMongoId,
    eventName: String(event.name),
    slideshows: slideshows.map((slideshow) => ({
      id: String(slideshow.slideshowId),
      name: String(slideshow.name),
    })),
    layouts: layouts.map((layout) => ({
      id: String(layout.layoutId),
      name: String(layout.name),
    })),
    logos: logos.map((logo) => ({
      logoId: String(logo.logoId),
      name: String(logo.name),
      imageUrl: String(logo.imageUrl),
    })),
    landingPage: landingPage
      ? {
          _id: String(landingPage._id),
          slug: String(landingPage.slug),
          title: (landingPage.title as string | null | undefined) ?? '',
          description: (landingPage.description as string | null | undefined) ?? '',
          logoId: (landingPage.logoId as string | null | undefined) ?? '',
          qrCodeImageUrl: (landingPage.qrCodeImageUrl as string | null | undefined) ?? '',
          url: (landingPage.url as string | null | undefined) ?? '',
          termsMarkdown: (landingPage.termsMarkdown as string | null | undefined) ?? '',
          termsFileName: (landingPage.termsFileName as string | null | undefined) ?? '',
          privacyMarkdown: (landingPage.privacyMarkdown as string | null | undefined) ?? '',
          privacyFileName: (landingPage.privacyFileName as string | null | undefined) ?? '',
          cookieConsentEnabled: landingPage.cookieConsentEnabled !== false,
          targetType: landingPage.targetType === 'layout' ? 'layout' : 'slideshow',
          targetId: String(landingPage.targetId),
          isActive: landingPage.isActive !== false,
        }
      : null,
  };
}
