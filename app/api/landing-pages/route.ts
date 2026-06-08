import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateId, generateTimestamp, type LandingPageTargetType } from '@/lib/db/schemas';
import { normalizeLandingPageSlugInput } from '@/lib/landing-pages';
import { upsertLandingPageCssPreset } from '@/lib/landing-page-css-presets';
import {
  withErrorHandler,
  requireAuth,
  apiBadRequest,
  apiCreated,
  apiNotFound,
  apiSuccess,
} from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';

const MAX_MARKDOWN_CHARS = 100_000;
const MAX_CUSTOM_CSS_CHARS = 40_000;
const CSS_CLASS_RE = /^[A-Za-z_-][A-Za-z0-9_-]*(?:\s+[A-Za-z_-][A-Za-z0-9_-]*)*$/;

function textOrNull(value: unknown): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function optionalMarkdown(value: unknown, label: string): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  if (text.length > MAX_MARKDOWN_CHARS) {
    throw apiBadRequest(`${label} is too large.`);
  }
  return text;
}

function optionalCustomCss(value: unknown): string | null {
  const text = String(value ?? '');
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_CUSTOM_CSS_CHARS) {
    throw apiBadRequest('Custom CSS is too large.');
  }
  return trimmed;
}

function optionalCssClassName(value: unknown): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  if (!CSS_CLASS_RE.test(text)) {
    throw apiBadRequest('Custom CSS class name may only contain letters, numbers, hyphens, underscores, and spaces.');
  }
  return text;
}

async function resolveTarget(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  eventUuid: string,
  targetType: LandingPageTargetType,
  targetId: string
): Promise<{ targetId: string; targetName: string }> {
  if (targetType === 'slideshow') {
    const slideshow = await db.collection(COLLECTIONS.SLIDESHOWS).findOne({
      slideshowId: targetId,
      eventId: eventUuid,
    });
    if (!slideshow) {
      throw apiBadRequest('Selected slideshow was not found for this event.');
    }
    return {
      targetId: slideshow.slideshowId as string,
      targetName: slideshow.name as string,
    };
  }

  const layout = await db.collection(COLLECTIONS.SLIDESHOW_LAYOUTS).findOne({
    layoutId: targetId,
    eventId: eventUuid,
  });
  if (!layout) {
    throw apiBadRequest('Selected slideshow layout was not found for this event.');
  }
  return {
    targetId: layout.layoutId as string,
    targetName: layout.name as string,
  };
}

function serializeLandingPage(doc: Record<string, unknown>) {
  return {
    ...doc,
    _id: String(doc._id),
  };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();
  const eventMongoId = request.nextUrl.searchParams.get('eventMongoId');
  if (!eventMongoId || !ObjectId.isValid(eventMongoId)) {
    throw apiBadRequest('Valid eventMongoId is required.');
  }

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, eventMongoId, 'viewer');
  const landingPages = await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .find({ eventMongoId })
    .sort({ createdAt: -1 })
    .toArray();

  return apiSuccess({
    landingPages: landingPages.map((doc) => serializeLandingPage(doc as Record<string, unknown>)),
  });
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await requireAuth();
  const body = await request.json();
  const eventMongoId = String(body.eventMongoId ?? '');

  if (!ObjectId.isValid(eventMongoId)) {
    throw apiBadRequest('Valid eventMongoId is required.');
  }

  const db = await connectToDatabase();
  await assertGlobalAdminOrPartnerEventAccess(db, session, eventMongoId, 'manager');

  const slugNorm = normalizeLandingPageSlugInput(body.slug);
  if (!slugNorm.ok) {
    throw apiBadRequest(slugNorm.error);
  }

  const targetType = body.targetType === 'layout' ? 'layout' : body.targetType === 'slideshow' ? 'slideshow' : null;
  if (!targetType) {
    throw apiBadRequest('targetType must be "slideshow" or "layout".');
  }

  const targetInputId = String(body.targetId ?? '').trim();
  if (!targetInputId) {
    throw apiBadRequest('targetId is required.');
  }

  const duplicate = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ slug: slugNorm.slug });
  if (duplicate) {
    throw apiBadRequest('This landing page slug is already in use.');
  }

  const event = await db.collection(COLLECTIONS.EVENTS).findOne({ _id: new ObjectId(eventMongoId) });
  if (!event) {
    throw apiNotFound('Event');
  }

  const target = await resolveTarget(db, event.eventId as string, targetType, targetInputId);
  const logoId = textOrNull(body.logoId);
  let logoUrl: string | null = null;
  if (logoId) {
    const logo = await db.collection(COLLECTIONS.LOGOS).findOne({ logoId });
    if (!logo) {
      throw apiBadRequest('Selected logo was not found.');
    }
    logoUrl = String(logo.imageUrl ?? '');
  }

  const customCssClassName = optionalCssClassName(body.customCssClassName);
  const customCss = optionalCustomCss(body.customCss);
  const savedCssPreset =
    customCssClassName && customCss
      ? await upsertLandingPageCssPreset(db, {
          presetId: textOrNull(body.customCssPresetId),
          name: textOrNull(body.customCssPresetName),
          className: customCssClassName,
          css: customCss,
          createdBy: session.user.id,
        })
      : null;

  const now = generateTimestamp();
  const landingPage = {
    landingPageId: generateId(),
    eventMongoId,
    eventId: String(event.eventId),
    eventName: String(event.name),
    slug: slugNorm.slug,
    title: textOrNull(body.title),
    description: textOrNull(body.description),
    logoId,
    logoUrl,
    qrCodeImageUrl: textOrNull(body.qrCodeImageUrl),
    url: textOrNull(body.url),
    urlButtonText: textOrNull(body.urlButtonText),
    termsMarkdown: optionalMarkdown(body.termsMarkdown, 'Terms and conditions'),
    termsFileName: textOrNull(body.termsFileName),
    privacyMarkdown: optionalMarkdown(body.privacyMarkdown, 'Privacy policy'),
    privacyFileName: textOrNull(body.privacyFileName),
    customCssPresetId: savedCssPreset?.presetId ?? null,
    customCssClassName: savedCssPreset?.className ?? customCssClassName,
    customCss: savedCssPreset?.css ?? customCss,
    cookieConsentEnabled: Boolean(body.cookieConsentEnabled),
    targetType,
    targetId: target.targetId,
    targetName: target.targetName,
    isActive: body.isActive !== false,
    createdBy: session.user.id,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTIONS.LANDING_PAGES).insertOne(landingPage);

  return apiCreated({
    landingPage: serializeLandingPage({
      _id: result.insertedId.toString(),
      ...landingPage,
    }),
  });
});
