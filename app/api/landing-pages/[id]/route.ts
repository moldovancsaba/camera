import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp, type LandingPageTargetType } from '@/lib/db/schemas';
import { normalizeLandingPageSlugInput } from '@/lib/landing-pages';
import {
  withErrorHandler,
  requireAdmin,
  apiBadRequest,
  apiNoContent,
  apiNotFound,
  apiSuccess,
} from '@/lib/api';

const MAX_MARKDOWN_CHARS = 100_000;

function serializeLandingPage(doc: Record<string, unknown>) {
  return {
    ...doc,
    _id: String(doc._id),
  };
}

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
      targetId: String(slideshow.slideshowId),
      targetName: String(slideshow.name),
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
    targetId: String(layout.layoutId),
    targetName: String(layout.name),
  };
}

export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  await requireAdmin();
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid landing page ID.');
  }

  const db = await connectToDatabase();
  const landingPage = await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .findOne({ _id: new ObjectId(id) });

  if (!landingPage) {
    throw apiNotFound('Landing page');
  }

  return apiSuccess({
    landingPage: serializeLandingPage(landingPage as Record<string, unknown>),
  });
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  await requireAdmin();
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid landing page ID.');
  }

  const db = await connectToDatabase();
  const existing = await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .findOne({ _id: new ObjectId(id) });

  if (!existing) {
    throw apiNotFound('Landing page');
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {
    updatedAt: generateTimestamp(),
  };

  if (body.slug !== undefined) {
    const slugNorm = normalizeLandingPageSlugInput(body.slug);
    if (!slugNorm.ok) {
      throw apiBadRequest(slugNorm.error);
    }
    const duplicate = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({
      slug: slugNorm.slug,
      _id: { $ne: new ObjectId(id) },
    });
    if (duplicate) {
      throw apiBadRequest('This landing page slug is already in use.');
    }
    updates.slug = slugNorm.slug;
  }

  if (body.title !== undefined) updates.title = textOrNull(body.title);
  if (body.description !== undefined) updates.description = textOrNull(body.description);
  if (body.qrCodeImageUrl !== undefined) updates.qrCodeImageUrl = textOrNull(body.qrCodeImageUrl);
  if (body.url !== undefined) updates.url = textOrNull(body.url);
  if (body.termsMarkdown !== undefined) updates.termsMarkdown = optionalMarkdown(body.termsMarkdown, 'Terms and conditions');
  if (body.termsFileName !== undefined) updates.termsFileName = textOrNull(body.termsFileName);
  if (body.privacyMarkdown !== undefined) updates.privacyMarkdown = optionalMarkdown(body.privacyMarkdown, 'Privacy policy');
  if (body.privacyFileName !== undefined) updates.privacyFileName = textOrNull(body.privacyFileName);
  if (body.cookieConsentEnabled !== undefined) updates.cookieConsentEnabled = Boolean(body.cookieConsentEnabled);
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

  if (body.logoId !== undefined) {
    const logoId = textOrNull(body.logoId);
    if (!logoId) {
      updates.logoId = null;
      updates.logoUrl = null;
    } else {
      const logo = await db.collection(COLLECTIONS.LOGOS).findOne({ logoId });
      if (!logo) {
        throw apiBadRequest('Selected logo was not found.');
      }
      updates.logoId = logoId;
      updates.logoUrl = String(logo.imageUrl ?? '');
    }
  }

  if (body.targetType !== undefined || body.targetId !== undefined) {
    const targetType = body.targetType === 'layout' ? 'layout' : body.targetType === 'slideshow' ? 'slideshow' : null;
    const targetInputId = String(body.targetId ?? '').trim();
    if (!targetType || !targetInputId) {
      throw apiBadRequest('Both targetType and targetId are required when changing the target.');
    }
    const target = await resolveTarget(
      db,
      String(existing.eventId),
      targetType,
      targetInputId
    );
    updates.targetType = targetType;
    updates.targetId = target.targetId;
    updates.targetName = target.targetName;
  }

  await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .updateOne({ _id: new ObjectId(id) }, { $set: updates });

  const updated = await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .findOne({ _id: new ObjectId(id) });

  if (!updated) {
    throw apiNotFound('Landing page');
  }

  return apiSuccess({
    landingPage: serializeLandingPage(updated as Record<string, unknown>),
  });
});

export const DELETE = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  await requireAdmin();
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    throw apiBadRequest('Invalid landing page ID.');
  }

  const db = await connectToDatabase();
  const result = await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    throw apiNotFound('Landing page');
  }

  return apiNoContent();
});
