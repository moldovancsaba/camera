/**
 * Public Share Page
 * 
 * Displays shared photo submissions with Open Graph meta tags.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicShell from '@/components/public/PublicPageShell';
import { Alert, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import { listApprovedShareVariants } from '@/lib/tryon/publication';
import {
  DEFAULT_PENDING_TRYON_MESSAGE,
  normalizeEventSharePageSettings,
  type EventSharePageSettings,
} from '@/lib/events/share-page-settings';
import {
  type ShareVariantCard,
  prioritizeShareVariantCardsForFeaturedDisplay,
  limitShareVariantsToConfiguredMode,
  pickFirstCheckedInTryOnVariantCard,
} from '@/lib/tryon/share-page-variants';

interface Props {
  params: Promise<{ id: string }>;
}

interface ShareSubmission {
  id?: string;
  imageUrl?: string;
  userName?: string;
  userInfo?: {
    name?: string | null;
    email?: string | null;
  } | null;
  createdAt?: string;
  submissionKind?: 'original' | 'tryon_result';
  sourceSubmissionId?: string | null;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected';
  isShareVisible?: boolean;
  tryOnLeatherSuitId?: string | null;
  metadata?: {
    finalWidth?: number;
    finalHeight?: number;
    compositionEngine?: string;
    tryOnRawResultUrl?: string | null;
  };
  tryOnRequest?: {
    requested?: boolean;
    sourceImageUrl?: string | null;
    shareVisible?: boolean;
  } | null;
  eventIds?: unknown[];
  eventId?: unknown;
}

const FALLBACK_SHARE_PAGE_SETTINGS: EventSharePageSettings = {
  includeOriginalCapture: false,
  includeCameraResult: true,
  includeTryOnResult: false,
  includeFramedTryOnResult: false,
  includeCheckedInTryOnResult: false,
  showCreateYourOwnButton: false,
  pendingTryOnMessage: DEFAULT_PENDING_TRYON_MESSAGE,
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

async function resolveEventForSubmission(
  db: Db,
  submission: Record<string, unknown>
): Promise<{ mongoId: string; name: string; sharePageSettings: EventSharePageSettings } | null> {
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
  if (!eventDoc?._id) return null;
  const name =
    typeof eventDoc.name === 'string' && eventDoc.name.trim()
      ? eventDoc.name.trim()
      : 'Event';
  const sharePage = eventDoc.sharePage && typeof eventDoc.sharePage === 'object'
    ? eventDoc.sharePage
    : null;
  return {
    mongoId: eventDoc._id.toString(),
    name,
    sharePageSettings: normalizeEventSharePageSettings(sharePage),
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function resolveDisplayName(userName: string | null, userInfoName: string | null): string {
  const normalizedUserInfoName = userInfoName?.trim();
  if (normalizedUserInfoName && !isLikelyEmail(normalizedUserInfoName) && !isLegacyGuestName(normalizedUserInfoName)) {
    return normalizedUserInfoName;
  }
  const normalizedUserName = userName?.trim();
  if (normalizedUserName && !isLikelyEmail(normalizedUserName) && !isLegacyGuestName(normalizedUserName)) {
    return normalizedUserName;
  }
  return 'Guest';
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
  const isFramed = (() => {
    if (metadata.compositionEngine === 'motogp_leather_magic_framed') {
      return true;
    }
    return Boolean(resultUrl && rawResultUrl && resultUrl !== rawResultUrl);
  })();
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const submission = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .findOne({ _id: new ObjectId(id) });

    if (!submission) {
      return {
        title: 'Photo Not Found',
      };
    }

  const event = await resolveEventForSubmission(db, submission);
  const eventLabel = event?.name ?? 'Shared photo';
  const displayName = resolveDisplayName(
    readString(submission.userName),
    readString(submission.userInfo?.name)
  );
  const submissionImageUrl = readString(submission.imageUrl);
  const openGraph: NonNullable<Metadata['openGraph']> = {
    title: `Photo of ${displayName}`,
    description: `From ${eventLabel}`,
    type: 'website',
  };
  const twitter: NonNullable<Metadata['twitter']> = {
    card: submissionImageUrl ? 'summary_large_image' : 'summary',
    title: `Photo of ${displayName}`,
    description: `From ${eventLabel}`,
  };

    if (submissionImageUrl) {
      openGraph.images = [
        {
          url: submissionImageUrl,
          width: 1200,
          height: 1200,
          alt: `Photo of ${displayName}`,
        },
      ];
      twitter.images = [submissionImageUrl];
    }

    return {
      title: `Photo of ${displayName} — ${eventLabel}`,
      description: `Photo from ${eventLabel}`,
      openGraph,
      twitter,
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Photo',
    };
  }
}

export default async function SharePage({ params }: Props) {
  let submission: ShareSubmission | null = null;
  const shareVariants: ShareVariantCard[] = [];
  const addUniqueShareVariant = (variant: ShareVariantCard) => {
    if (!shareVariants.some((item) => item.id === variant.id)) {
      shareVariants.push(variant);
    }
  };
  
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const doc = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .findOne({ _id: new ObjectId(id) });
    if (doc && typeof doc === 'object') {
      submission = {
        id: doc._id.toString(),
        imageUrl: readString(doc.imageUrl) ?? undefined,
        userName: typeof doc.userName === 'string' ? doc.userName : undefined,
        userInfo:
          doc.userInfo && typeof doc.userInfo === 'object'
            ? {
                name: readString((doc.userInfo as { name?: unknown }).name),
                email: readString((doc.userInfo as { email?: unknown }).email),
              }
            : undefined,
        createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : undefined,
        submissionKind:
          doc.submissionKind === 'tryon_result' ? 'tryon_result' : 'original',
        sourceSubmissionId:
          typeof doc.sourceSubmissionId === 'string' ? doc.sourceSubmissionId : null,
        reviewStatus:
          doc.reviewStatus === 'approved' || doc.reviewStatus === 'rejected' || doc.reviewStatus === 'pending_review'
            ? doc.reviewStatus
            : undefined,
        isShareVisible: Boolean((doc as { isShareVisible?: unknown }).isShareVisible),
        tryOnLeatherSuitId:
          typeof doc.tryOnLeatherSuitId === 'string' ? doc.tryOnLeatherSuitId : null,
        metadata:
          doc.metadata && typeof doc.metadata === 'object'
            ? {
                finalWidth:
                  typeof (doc.metadata as { finalWidth?: unknown }).finalWidth === 'number'
                    ? (doc.metadata as { finalWidth: number }).finalWidth
                    : undefined,
                finalHeight:
                  typeof (doc.metadata as { finalHeight?: unknown }).finalHeight === 'number'
                    ? (doc.metadata as { finalHeight: number }).finalHeight
                    : undefined,
                compositionEngine:
                  typeof (doc.metadata as { compositionEngine?: unknown }).compositionEngine === 'string'
                    ? (doc.metadata as { compositionEngine: string }).compositionEngine
                    : undefined,
                tryOnRawResultUrl:
                  typeof (doc.metadata as { tryOnRawResultUrl?: unknown }).tryOnRawResultUrl === 'string'
                    ? (doc.metadata as { tryOnRawResultUrl: string }).tryOnRawResultUrl
                    : null,
              }
            : undefined,
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
        eventIds: Array.isArray(doc.eventIds) ? doc.eventIds : undefined,
        eventId: doc.eventId,
      };
    }
  } catch (error) {
    console.error('Error fetching submission:', error);
  }

  if (!submission) {
    notFound();
  }

  const db = await connectToDatabase();
  const event = await resolveEventForSubmission(db, submission as unknown as Record<string, unknown>);
  const sharePageSettings = event?.sharePageSettings ?? FALLBACK_SHARE_PAGE_SETTINGS;
  const hasTryOnRequest = Boolean(submission.tryOnRequest?.requested);
  const enforcedSharePageSettings = hasTryOnRequest
    ? {
        ...sharePageSettings,
        includeOriginalCapture: false,
        includeCameraResult: false,
        includeTryOnResult: false,
        includeFramedTryOnResult: false,
        includeCheckedInTryOnResult: true,
      }
    : sharePageSettings;
  const showApprovedTryOnRelatedPhotos =
    enforcedSharePageSettings.includeTryOnResult ||
    enforcedSharePageSettings.includeFramedTryOnResult ||
    enforcedSharePageSettings.includeCheckedInTryOnResult;
  const currentSubmissionId = submission.id ?? '';
  const sourceSubmissionId =
    submission.submissionKind === 'tryon_result' && submission.sourceSubmissionId
      ? submission.sourceSubmissionId
      : currentSubmissionId;

  if (sourceSubmissionId) {
    let sourceDoc: Record<string, unknown> | null = null;

    if (
      submission.submissionKind === 'tryon_result' &&
      submission.sourceSubmissionId &&
      ObjectId.isValid(submission.sourceSubmissionId)
    ) {
      const foundSourceDoc = await db
        .collection(COLLECTIONS.SUBMISSIONS)
        .findOne({ _id: new ObjectId(submission.sourceSubmissionId) });
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

    if (enforcedSharePageSettings.includeCameraResult) {
      if (submission.submissionKind === 'original') {
        if (submissionImage) {
          addUniqueShareVariant({
            id: `${currentSubmissionId}:camera-result`,
            imageUrl: submissionImage,
            label: 'Photo with Camera frame',
          });
        }
      } else if (sourceDoc && typeof sourceDoc.imageUrl === 'string' && sourceDoc.imageUrl.trim()) {
        const sourceResultImage = readString(
          typeof sourceDoc?.imageUrl === 'string' ? sourceDoc.imageUrl : null
        );
        if (sourceResultImage) {
          addUniqueShareVariant({
            id: `${submission.sourceSubmissionId}:camera-result`,
            imageUrl: sourceResultImage,
            label: 'Photo with Camera frame',
          });
        }
      }
    }

    if (enforcedSharePageSettings.includeOriginalCapture && sourceImageUrl) {
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
        approvedAt: typeof variant.approvedAt === 'string' ? variant.approvedAt : null,
        metadata:
          variant.metadata && typeof variant.metadata === 'object'
            ? {
                compositionEngine: (variant.metadata as { compositionEngine?: unknown }).compositionEngine,
                tryOnRawResultUrl: (variant.metadata as { tryOnRawResultUrl?: unknown }).tryOnRawResultUrl,
              }
            : null,
      }));

      const selfVariant: TryOnVariantLike | null =
        submission.submissionKind === 'tryon_result' &&
        (submission.reviewStatus === 'approved' || Boolean(submission.isShareVisible))
          ? {
              _id: { toString: () => currentSubmissionId },
              imageUrl: submission.imageUrl,
              finalImageUrl: submission.imageUrl,
              createdAt: submission.createdAt,
              tryOnLeatherSuitId: submission.tryOnLeatherSuitId,
              metadata: {
                compositionEngine: submission.metadata?.compositionEngine,
                tryOnRawResultUrl: submission.metadata?.tryOnRawResultUrl,
              },
            }
          : null;

      if (selfVariant) {
        variantCandidates.push(selfVariant);
      }

      variantCandidates.forEach((variant) => {
        buildTryOnVariantCards(variant, enforcedSharePageSettings).forEach((card) => {
          addUniqueShareVariant(card);
        });
      });

      if (enforcedSharePageSettings.includeCheckedInTryOnResult) {
        const checkedInVariant = pickFirstCheckedInTryOnVariantCard(
          variantCandidates,
          enforcedSharePageSettings
        );
        if (checkedInVariant) {
          if (!shareVariants.some((variant) => variant.id === checkedInVariant.id)) {
            shareVariants.unshift(checkedInVariant);
          }
        }
      }
    }
  }

  const shouldShowCheckedInOnly = hasTryOnRequest;

  const filteredVariants = shareVariants.filter((variant) => {
    if (
      variant.id.endsWith(':original-capture') &&
      !enforcedSharePageSettings.includeOriginalCapture
    ) {
      return false;
    }
    if (
      variant.id.endsWith(':camera-result') &&
      !enforcedSharePageSettings.includeCameraResult
    ) {
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
    limitShareVariantsToConfiguredMode(filteredVariants, enforcedSharePageSettings),
    enforcedSharePageSettings
  );

  const featuredVariant = displayVariants[0] ?? null;
  const galleryVariants = featuredVariant ? displayVariants.slice(1) : displayVariants;
  const hasTryOnVariant = displayVariants.some((variant) => variant.isTryOn);
  const downloadableImageUrl = featuredVariant?.imageUrl ?? null;
  const hasDownloadableImage = Boolean(downloadableImageUrl);
  const downloadableImageHref = hasDownloadableImage && featuredVariant && submission.id
    ? `/api/share/${submission.id}/download?variant=${encodeURIComponent(featuredVariant.id)}`
    : null;
  const imageMissingMessage = sharePageSettings.pendingTryOnMessage;

  const showPendingTryOnMessage =
    hasTryOnRequest &&
    submission.submissionKind !== 'tryon_result' &&
    (!hasTryOnVariant || submission.tryOnRequest?.shareVisible === false);

  // `/capture/[eventId]` expects the event document Mongo `_id`, while submissions often store public `eventId` UUID in `eventIds` / `eventId`.
  let createYourOwnHref = '/capture';
  if (event?.mongoId) {
    createYourOwnHref = `/capture/${event.mongoId}`;
  }

  const headline = event?.name ?? 'Shared photo';
  const displayName = resolveDisplayName(
    readString(submission.userName),
    readString(submission.userInfo?.name)
  );

  return (
    <PublicShell size="lg">
      <Stack gap="xl">
        <Stack align="center" gap="xs" ta="center">
          <Title order={1}>
            {headline}
          </Title>
        </Stack>

        <div>
          {featuredVariant ? (
            <div
              style={{
                position: 'relative',
                borderRadius: 12,
                overflow: 'hidden',
                marginBottom: 16,
                marginInline: 'auto',
                aspectRatio:
                  featuredVariant && submission.metadata?.finalWidth && submission.metadata?.finalHeight
                    ? `${submission.metadata.finalWidth} / ${submission.metadata.finalHeight}`
                    : '1',
                maxWidth: '100%',
              }}
            >
              <Image
                src={featuredVariant.imageUrl}
                alt={featuredVariant.label}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          ) : (
            <Text
              size="sm"
              c="dimmed"
              ta="center"
              mb="md"
              style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {imageMissingMessage}
            </Text>
          )}

          <Text size="sm" c="dimmed" ta="right" mb="lg">
            {submission.createdAt ? formatDateTime(submission.createdAt) : ''}
          </Text>

          <Group gap="md" grow>
            {downloadableImageHref ? (
              <Button
                component="a"
                href={downloadableImageHref}
                download
                size="lg"
              >
                Download
              </Button>
            ) : (
              <Button size="lg" disabled>
                Download
              </Button>
            )}
            {sharePageSettings.showCreateYourOwnButton ? (
              <Button component="a" href={createYourOwnHref} variant="default" size="lg">
                Create Your Own
              </Button>
            ) : null}
          </Group>

          {showPendingTryOnMessage && featuredVariant ? (
            <Alert color="blue" variant="light" mt="xl">
              {sharePageSettings.pendingTryOnMessage}
            </Alert>
          ) : null}

          {galleryVariants.length > 0 ? (
            <Stack gap="md" mt="xl">
              <Text fw={700}>
            {enforcedSharePageSettings.includeTryOnResult ||
            enforcedSharePageSettings.includeFramedTryOnResult
              ? 'Related photos'
              : 'Related photos'}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                {galleryVariants.map((variant) => (
                  <Card
                    component="a"
                    key={variant.id}
                    href={variant.id.includes(':') ? variant.imageUrl : `/share/${variant.id}`}
                    target={variant.id.includes(':') ? '_blank' : undefined}
                    rel={variant.id.includes(':') ? 'noopener noreferrer' : undefined}
                    withBorder
                    padding={0}
                    style={{ textDecoration: 'none', color: 'inherit', overflow: 'hidden' }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '1' }}>
                      <Image src={variant.imageUrl} alt={variant.label} fill unoptimized className="object-cover" />
                    </div>
                    <div style={{ padding: '0.875rem' }}>
                      <Text fw={600} size="sm">
                        {variant.label}
                      </Text>
                    </div>
                  </Card>
                ))}
              </SimpleGrid>
            </Stack>
          ) : null}
        </div>
      </Stack>
    </PublicShell>
  );
}
