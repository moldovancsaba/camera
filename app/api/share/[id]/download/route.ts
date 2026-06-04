import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { listApprovedShareVariants } from '@/lib/tryon/publication';
import {
  type ShareVariantCard,
  prioritizeShareVariantCardsForFeaturedDisplay,
  limitShareVariantsToConfiguredMode,
  pickFirstCheckedInTryOnVariantCard,
} from '@/lib/tryon/share-page-variants';
import {
  DEFAULT_EVENT_SHARE_PAGE_SETTINGS,
  normalizeEventSharePageSettings,
  type EventSharePageSettings,
} from '@/lib/events/share-page-settings';

interface ShareSubmission {
  id: string;
  imageUrl: string | null;
  submissionKind: 'original' | 'tryon_result';
  createdAt?: string | null;
  sourceSubmissionId: string | null;
  eventIds: unknown[] | null;
  eventId?: unknown;
  reviewStatus: 'pending_review' | 'approved' | 'rejected' | undefined;
  isShareVisible: boolean;
  tryOnLeatherSuitId: string | null;
  metadata: {
    compositionEngine?: string;
    tryOnRawResultUrl?: string | null;
  } | null;
  tryOnRequest: {
    requested: boolean;
    sourceImageUrl: string | null;
    shareVisible: boolean;
  } | null;
}

const FALLBACK_SHARE_PAGE_SETTINGS: EventSharePageSettings = {
  includeOriginalCapture: false,
  includeCameraResult: true,
  includeTryOnResult: false,
  includeFramedTryOnResult: false,
  includeCheckedInTryOnResult: false,
  showCreateYourOwnButton: false,
  pendingTryOnMessage: DEFAULT_EVENT_SHARE_PAGE_SETTINGS.pendingTryOnMessage,
};

interface TryOnVariantLike {
  _id?: {
    toString: () => string;
  };
  imageUrl?: string | null;
  finalImageUrl?: string | null;
  tryOnLeatherSuitId?: string | null;
  createdAt?: string | null;
  approvedAt?: string | null;
  metadata?: {
    compositionEngine?: unknown;
    tryOnRawResultUrl?: unknown;
  } | null;
}

export const dynamic = 'force-dynamic';

function getSubmissionEventLookupKeys(submission: Record<string, unknown>): string[] {
  const candidates = [
    ...(Array.isArray(submission.eventIds) ? submission.eventIds : []),
    submission.eventId,
  ];
  const normalized = candidates
    .map((value) => {
      if (typeof value === 'string' || value instanceof String) {
        return value.trim();
      }
      if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
        return value.toString().trim();
      }
      return '';
    })
    .filter(Boolean);
  return Array.from(new Set(normalized.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function resolveEventForSubmission(
  db: Db,
  submission: Record<string, unknown>
): Promise<{ sharePageSettings: EventSharePageSettings } | null> {
  const eventLookupKeys = getSubmissionEventLookupKeys(submission);
  if (!eventLookupKeys.length) {
    return null;
  }

  const orClauses: Record<string, unknown>[] = eventLookupKeys.flatMap((key) => {
    const candidates: Record<string, unknown>[] = [{ eventId: key }];
    if (ObjectId.isValid(key)) {
      candidates.push({ _id: new ObjectId(key) });
    }
    return candidates;
  });

  const eventDoc = await db
    .collection(COLLECTIONS.EVENTS)
    .findOne({ $or: orClauses });

  if (!eventDoc) {
    return null;
  }

  const sharePage = eventDoc.sharePage && typeof eventDoc.sharePage === 'object'
    ? eventDoc.sharePage
    : null;

  return {
    sharePageSettings: normalizeEventSharePageSettings(sharePage),
  };
}

function buildTryOnVariantCards(
  variant: TryOnVariantLike,
  settings: EventSharePageSettings
): ShareVariantCard[] {
  const id = variant._id?.toString() ?? '';
  const metadata = variant.metadata && typeof variant.metadata === 'object'
    ? variant.metadata as { compositionEngine?: unknown; tryOnRawResultUrl?: unknown }
    : {};
  const resultUrl = readString(variant.imageUrl) || readString(variant.finalImageUrl);
  const rawResultUrl = readString(metadata.tryOnRawResultUrl);
  const isFramed = metadata.compositionEngine === 'motogp_leather_magic_framed';
  const suitLabel = readString(variant.tryOnLeatherSuitId) || 'Approved try-on result';
  const cards: ShareVariantCard[] = [];

  if (settings.includeTryOnResult && rawResultUrl) {
    cards.push({
      id: `${id}:tryon-generated`,
      imageUrl: rawResultUrl,
      label: `${suitLabel} - generated`,
      isTryOn: true,
    });
  }

  if (resultUrl) {
    if (isFramed && settings.includeFramedTryOnResult) {
      cards.push({
        id: `${id}:tryon-framed`,
        imageUrl: resultUrl,
        label: `${suitLabel} - with frame`,
        isTryOn: true,
      });
    }

    if (!isFramed && settings.includeTryOnResult) {
      cards.push({
        id: `${id}:tryon-result`,
        imageUrl: resultUrl,
        label: suitLabel,
        isTryOn: true,
      });
    }
  }

  return cards;
}

async function resolveShareImageUrlByVariantId(
  db: Db,
  submission: ShareSubmission,
  variantId: string
): Promise<string | null> {
  const shareVariants: ShareVariantCard[] = [];
  const addUniqueShareVariant = (variant: ShareVariantCard) => {
    if (!shareVariants.some((item) => item.id === variant.id)) {
      shareVariants.push(variant);
    }
  };

  const event = await resolveEventForSubmission(db, submission as unknown as Record<string, unknown>);
  const sharePageSettings = event?.sharePageSettings ?? FALLBACK_SHARE_PAGE_SETTINGS;
  const showApprovedTryOnRelatedPhotos =
    sharePageSettings.includeTryOnResult ||
    sharePageSettings.includeFramedTryOnResult ||
    sharePageSettings.includeCheckedInTryOnResult;

  const sourceSubmissionId =
    submission.submissionKind === 'tryon_result' && submission.sourceSubmissionId
      ? submission.sourceSubmissionId
      : submission.id;
  const currentSubmissionId = submission.id;

  let sourceDoc: Record<string, unknown> | null = null;

  if (submission.submissionKind === 'tryon_result' && submission.sourceSubmissionId && ObjectId.isValid(submission.sourceSubmissionId)) {
    const foundSourceDoc = await db.collection(COLLECTIONS.SUBMISSIONS).findOne({ _id: new ObjectId(submission.sourceSubmissionId) });
    if (foundSourceDoc) {
      sourceDoc = foundSourceDoc as Record<string, unknown>;
    }
  }

  const submissionImage = readString(submission.imageUrl);
  const sourceImageUrl = readString(
    sourceDoc && typeof sourceDoc.tryOnRequest === 'object' && sourceDoc.tryOnRequest !== null
      ? (sourceDoc.tryOnRequest as { sourceImageUrl?: unknown }).sourceImageUrl
      : submission.tryOnRequest?.sourceImageUrl
  );

  if (sharePageSettings.includeCameraResult) {
    if (submission.submissionKind === 'original') {
      if (submissionImage) {
        addUniqueShareVariant({
          id: `${currentSubmissionId}:camera-result`,
          imageUrl: submissionImage,
          label: 'Photo with Camera frame',
        });
      }
    } else if (sourceDoc && typeof sourceDoc.imageUrl === 'string' && sourceDoc.imageUrl.trim()) {
      const sourceResultImage = readString(sourceDoc.imageUrl);
      if (sourceResultImage) {
        addUniqueShareVariant({
          id: `${submission.sourceSubmissionId}:camera-result`,
          imageUrl: sourceResultImage,
          label: 'Photo with Camera frame',
        });
      }
    }
  }

  if (sharePageSettings.includeOriginalCapture && sourceImageUrl) {
    addUniqueShareVariant({
      id: `${(submission.submissionKind === 'original' ? currentSubmissionId : submission.sourceSubmissionId) ?? currentSubmissionId}:original-capture`,
      imageUrl: sourceImageUrl,
      label: 'Original photo taken',
    });
  }

  if (showApprovedTryOnRelatedPhotos) {
    const variants = await listApprovedShareVariants(db, sourceSubmissionId);
    const variantCandidates: TryOnVariantLike[] = variants.map((variant) => ({
      _id: { toString: () => variant._id.toString() },
      imageUrl: variant.imageUrl,
      finalImageUrl: variant.finalImageUrl,
      tryOnLeatherSuitId: variant.tryOnLeatherSuitId ?? null,
      createdAt: typeof variant.createdAt === 'string' ? variant.createdAt : null,
      approvedAt: typeof (variant as { approvedAt?: unknown }).approvedAt === 'string'
        ? (variant as { approvedAt: string }).approvedAt
        : null,
      metadata:
        variant.metadata && typeof variant.metadata === 'object'
          ? {
              compositionEngine: (variant.metadata as { compositionEngine?: unknown }).compositionEngine,
              tryOnRawResultUrl: (variant.metadata as { tryOnRawResultUrl?: unknown }).tryOnRawResultUrl,
            }
          : null,
    }));

    if (
      submission.submissionKind === 'tryon_result' &&
      (submission.reviewStatus === 'approved' || Boolean(submission.isShareVisible))
    ) {
      variantCandidates.push({
        _id: { toString: () => currentSubmissionId },
        imageUrl: submission.imageUrl,
        createdAt: submission.createdAt,
        tryOnLeatherSuitId: submission.tryOnLeatherSuitId,
        metadata: {
          compositionEngine: submission.metadata?.compositionEngine,
          tryOnRawResultUrl: submission.metadata?.tryOnRawResultUrl,
        },
      });
    }

    variantCandidates.forEach((variant) => {
      buildTryOnVariantCards(variant, sharePageSettings).forEach((card) => {
        addUniqueShareVariant(card);
      });
    });

    if (sharePageSettings.includeCheckedInTryOnResult) {
      const checkedInVariant = pickFirstCheckedInTryOnVariantCard(
        variantCandidates,
        sharePageSettings
      );
      if (checkedInVariant) {
        const alreadyExists = shareVariants.some((variant) => variant.id === checkedInVariant.id);
        if (!alreadyExists) {
          shareVariants.unshift(checkedInVariant);
        }
      }
    }
  }

  const shouldShowCheckedInOnly =
    Boolean(submission.tryOnRequest?.requested) &&
    (sharePageSettings.includeTryOnResult ||
      sharePageSettings.includeFramedTryOnResult ||
      sharePageSettings.includeCheckedInTryOnResult);

  const filteredVariants = shareVariants.filter((variant) => {
    if (variant.id.endsWith(':original-capture') && !sharePageSettings.includeOriginalCapture) {
      return false;
    }
    if (variant.id.endsWith(':camera-result') && !sharePageSettings.includeCameraResult) {
      return false;
    }
    if (
      shouldShowCheckedInOnly &&
      (variant.id.endsWith(':original-capture') || variant.id.endsWith(':camera-result'))
    ) {
      return false;
    }
    return true;
  });
  const displayVariants = prioritizeShareVariantCardsForFeaturedDisplay(
    limitShareVariantsToConfiguredMode(filteredVariants, sharePageSettings),
    sharePageSettings
  );

  const normalizedVariantId = variantId;

  const selected = displayVariants.find((variant) => variant.id === normalizedVariantId) ?? null;
  return selected?.imageUrl ?? null;
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
    if (!doc || typeof doc !== 'object') {
      return NextResponse.json({ error: 'Share submission not found' }, { status: 404 });
    }

    const sourceSubmissionId = readString(doc.sourceSubmissionId);
    const submission: ShareSubmission = {
      id: String(doc._id),
      imageUrl: readString(doc.imageUrl),
      createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : null,
      submissionKind:
        doc.submissionKind === 'tryon_result' ? 'tryon_result' : 'original',
      sourceSubmissionId: sourceSubmissionId || null,
      eventIds: Array.isArray(doc.eventIds) ? doc.eventIds : null,
      eventId: doc.eventId ?? null,
      reviewStatus:
        doc.reviewStatus === 'approved' || doc.reviewStatus === 'rejected' || doc.reviewStatus === 'pending_review'
          ? doc.reviewStatus
          : undefined,
      isShareVisible: Boolean((doc as { isShareVisible?: unknown }).isShareVisible),
      tryOnLeatherSuitId: readString(doc.tryOnLeatherSuitId),
      metadata:
        doc.metadata && typeof doc.metadata === 'object'
          ? {
              compositionEngine:
                typeof (doc.metadata as { compositionEngine?: unknown }).compositionEngine === 'string'
                  ? (doc.metadata as { compositionEngine: string }).compositionEngine
                  : undefined,
              tryOnRawResultUrl:
                typeof (doc.metadata as { tryOnRawResultUrl?: unknown }).tryOnRawResultUrl === 'string'
                  ? (doc.metadata as { tryOnRawResultUrl: string }).tryOnRawResultUrl
                  : null,
            }
          : null,
      tryOnRequest:
        doc.tryOnRequest && typeof doc.tryOnRequest === 'object'
          ? {
              requested: Boolean((doc.tryOnRequest as { requested?: unknown }).requested),
              sourceImageUrl:
                typeof (doc.tryOnRequest as { sourceImageUrl?: unknown }).sourceImageUrl === 'string'
                  ? (doc.tryOnRequest as { sourceImageUrl: string }).sourceImageUrl
                  : null,
              shareVisible: Boolean((doc.tryOnRequest as { shareVisible?: unknown }).shareVisible),
            }
          : null,
    };

    const imageUrl = await resolveShareImageUrlByVariantId(db, submission, requestedVariantId);
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
