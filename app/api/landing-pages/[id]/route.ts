import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, generateTimestamp, type LandingPageTargetType } from '@/lib/db/schemas';
import { normalizeLandingPageSlugInput } from '@/lib/landing-pages';
import { upsertLandingPageCssPreset } from '@/lib/landing-page-css-presets';
import {
  withErrorHandler,
  requireAuth,
  apiBadRequest,
  apiNoContent,
  apiNotFound,
  apiSuccess,
} from '@/lib/api';
import { assertGlobalAdminOrPartnerEventAccess } from '@/lib/partners/authorization';
import type { PartnerAccessRole } from '@/lib/db/schemas';
import type { Session } from '@/lib/auth/session';

const MAX_MARKDOWN_CHARS = 100_000;
const MAX_CUSTOM_CSS_CHARS = 40_000;
const CSS_CLASS_RE = /^[A-Za-z_-][A-Za-z0-9_-]*(?:\s+[A-Za-z_-][A-Za-z0-9_-]*)*$/;

function serializeLandingPage(doc: Record<string, unknown>) {
  return {
    ...doc,
    _id: String(doc._id),
  };
}

async function loadLandingPageWithAccess(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  session: Session,
  landingPageId: string,
  minRole: PartnerAccessRole
) {
  if (!ObjectId.isValid(landingPageId)) {
    throw apiBadRequest('Invalid landing page ID.');
  }

  const landingPage = await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .findOne({ _id: new ObjectId(landingPageId) });

  if (!landingPage) {
    throw apiNotFound('Landing page');
  }

  const eventMongoId = String(landingPage.eventMongoId ?? '');
  if (!ObjectId.isValid(eventMongoId)) {
    throw apiBadRequest('Landing page is missing a valid event reference.');
  }

  await assertGlobalAdminOrPartnerEventAccess(db, session, eventMongoId, minRole);
  return landingPage as Record<string, unknown>;
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
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await requireAuth();
  const { id } = await context.params;
  const db = await connectToDatabase();
  const landingPage = await loadLandingPageWithAccess(db, session, id, 'viewer');

  return apiSuccess({
    landingPage: serializeLandingPage(landingPage),
  });
});

export const PATCH = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await requireAuth();
  const { id } = await context.params;
  const db = await connectToDatabase();
  const existing = await loadLandingPageWithAccess(db, session, id, 'manager');

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
  if (body.urlButtonText !== undefined) updates.urlButtonText = textOrNull(body.urlButtonText);
  if (body.termsMarkdown !== undefined) updates.termsMarkdown = optionalMarkdown(body.termsMarkdown, 'Terms and conditions');
  if (body.termsFileName !== undefined) updates.termsFileName = textOrNull(body.termsFileName);
  if (body.privacyMarkdown !== undefined) updates.privacyMarkdown = optionalMarkdown(body.privacyMarkdown, 'Privacy policy');
  if (body.privacyFileName !== undefined) updates.privacyFileName = textOrNull(body.privacyFileName);
  if (body.cookieConsentEnabled !== undefined) updates.cookieConsentEnabled = Boolean(body.cookieConsentEnabled);
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

  if (
    body.customCssPresetId !== undefined ||
    body.customCssClassName !== undefined ||
    body.customCss !== undefined
  ) {
    const className = optionalCssClassName(
      body.customCssClassName !== undefined ? body.customCssClassName : existing.customCssClassName
    );
    const css = optionalCustomCss(
      body.customCss !== undefined ? body.customCss : existing.customCss
    );
    if (className && css) {
      const preset = await upsertLandingPageCssPreset(db, {
        presetId:
          body.customCssPresetId !== undefined
            ? textOrNull(body.customCssPresetId)
            : textOrNull(existing.customCssPresetId),
        name: textOrNull(body.customCssPresetName),
        className,
        css,
        createdBy: session.user.id,
      });
      updates.customCssPresetId = preset.presetId;
      updates.customCssClassName = preset.className;
      updates.customCss = preset.css;
    } else {
      updates.customCssPresetId = null;
      updates.customCssClassName = className;
      updates.customCss = css;
    }
  }

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
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await requireAuth();
  const { id } = await context.params;
  const db = await connectToDatabase();
  await loadLandingPageWithAccess(db, session, id, 'manager');
  const result = await db
    .collection(COLLECTIONS.LANDING_PAGES)
    .deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    throw apiNotFound('Landing page');
  }

  return apiNoContent();
});
