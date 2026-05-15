import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { listLandingPageCssPresets, type LandingPageCssPresetOption } from '@/lib/landing-page-css-presets';
import { defaultCameraOrigin, defaultGoShortOrigin } from '@/lib/site-hosts';

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
  urlButtonText?: string | null;
  termsMarkdown?: string | null;
  termsFileName?: string | null;
  privacyMarkdown?: string | null;
  privacyFileName?: string | null;
  customCssPresetId?: string | null;
  customCssClassName?: string | null;
  customCss?: string | null;
  cookieConsentEnabled: boolean;
  targetType: 'slideshow' | 'layout';
  targetId: string;
  isActive: boolean;
}

export interface LandingPageEditorActionPreset {
  id: string;
  label: string;
  description: string;
  url: string;
  buttonText: string;
}

export interface LandingPageEditorPropsData {
  eventMongoId: string;
  eventName: string;
  slideshows: LandingPageEditorOption[];
  layouts: LandingPageEditorOption[];
  logos: LandingPageEditorLogo[];
  cssPresets: LandingPageCssPresetOption[];
  actionPresets: LandingPageEditorActionPreset[];
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

  const [slideshows, layouts, logos, cssPresets, landingPage] = await Promise.all([
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
    listLandingPageCssPresets(db),
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
    cssPresets,
    actionPresets: [
      {
        id: 'event-capture',
        label: 'Open Event Capture',
        description: 'Prefill the call-to-action with this event’s public capture URL.',
        url: `${defaultCameraOrigin()}/capture/${eventMongoId}`,
        buttonText: 'Send a Selfie',
      },
      {
        id: 'gym-workout',
        label: 'Open Workout Library',
        description: 'Send visitors directly into the current Gym workout flow.',
        url: `${defaultCameraOrigin()}/workout`,
        buttonText: 'Start Workout',
      },
      {
        id: 'gym-home',
        label: 'Open Gym Home',
        description: 'Use the Gym / member landing experience as the next action.',
        url: `${defaultCameraOrigin()}/`,
        buttonText: 'Open Gym App',
      },
      ...(typeof event.shortUrlSlug === 'string' && event.shortUrlSlug.trim()
        ? [
            {
              id: 'event-short-link',
              label: 'Open Short Link',
              description: 'Use the branded short link that redirects guests into event capture.',
              url: `${defaultGoShortOrigin()}/${event.shortUrlSlug.trim()}`,
              buttonText: 'Open Selfie Link',
            },
          ]
        : []),
    ],
    landingPage: landingPage
      ? {
          _id: String(landingPage._id),
          slug: String(landingPage.slug),
          title: (landingPage.title as string | null | undefined) ?? '',
          description: (landingPage.description as string | null | undefined) ?? '',
          logoId: (landingPage.logoId as string | null | undefined) ?? '',
          qrCodeImageUrl: (landingPage.qrCodeImageUrl as string | null | undefined) ?? '',
          url: (landingPage.url as string | null | undefined) ?? '',
          urlButtonText: (landingPage.urlButtonText as string | null | undefined) ?? '',
          termsMarkdown: (landingPage.termsMarkdown as string | null | undefined) ?? '',
          termsFileName: (landingPage.termsFileName as string | null | undefined) ?? '',
          privacyMarkdown: (landingPage.privacyMarkdown as string | null | undefined) ?? '',
          privacyFileName: (landingPage.privacyFileName as string | null | undefined) ?? '',
          customCssPresetId: (landingPage.customCssPresetId as string | null | undefined) ?? '',
          customCssClassName: (landingPage.customCssClassName as string | null | undefined) ?? '',
          customCss: (landingPage.customCss as string | null | undefined) ?? '',
          cookieConsentEnabled: landingPage.cookieConsentEnabled !== false,
          targetType: landingPage.targetType === 'layout' ? 'layout' : 'slideshow',
          targetId: String(landingPage.targetId),
          isActive: landingPage.isActive !== false,
        }
      : null,
  };
}
