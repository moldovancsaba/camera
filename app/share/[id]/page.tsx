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
import { Alert, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { listApprovedShareVariants } from '@/lib/tryon/publication';
import {
  DEFAULT_EVENT_SHARE_PAGE_SETTINGS,
  normalizeEventSharePageSettings,
  type EventSharePageSettings,
} from '@/lib/events/share-page-settings';

interface Props {
  params: Promise<{ id: string }>;
}

interface ShareSubmission {
  id?: string;
  imageUrl?: string;
  userName?: string;
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

interface ShareVariantCard {
  id: string;
  imageUrl: string;
  label: string;
  isTryOn?: boolean;
}

async function resolveEventForSubmission(
  db: Db,
  submission: Record<string, unknown>
): Promise<{ mongoId: string; name: string; sharePageSettings: EventSharePageSettings } | null> {
  const eventLookupKey =
    (Array.isArray(submission.eventIds) && submission.eventIds[0]) ||
    submission.eventId ||
    null;
  if (!eventLookupKey || !String(eventLookupKey).trim()) return null;
  const key = String(eventLookupKey).trim();
  const orClauses: Record<string, unknown>[] = [{ eventId: key }];
  if (ObjectId.isValid(key)) {
    orClauses.push({ _id: new ObjectId(key) });
  }
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

function buildTryOnVariantCards(
  variant: {
    _id?: { toString: () => string };
    imageUrl?: string | null;
    finalImageUrl?: string | null;
    tryOnLeatherSuitId?: string | null;
    metadata?: unknown;
  },
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
    const userName =
      typeof submission.userName === 'string' ? submission.userName : 'Guest';
    const submissionImageUrl = readString(submission.imageUrl);
    const openGraph: NonNullable<Metadata['openGraph']> = {
      title: `Photo by ${userName}`,
      description: `From ${eventLabel}`,
      type: 'website',
    };
    const twitter: NonNullable<Metadata['twitter']> = {
      card: submissionImageUrl ? 'summary_large_image' : 'summary',
      title: `Photo by ${userName}`,
      description: `From ${eventLabel}`,
    };

    if (submissionImageUrl) {
      openGraph.images = [
        {
          url: submissionImageUrl,
          width: 1200,
          height: 1200,
          alt: `Photo by ${userName}`,
        },
      ];
      twitter.images = [submissionImageUrl];
    }

    return {
      title: `Photo by ${userName} — ${eventLabel}`,
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
  const sharePageSettings = event?.sharePageSettings ?? DEFAULT_EVENT_SHARE_PAGE_SETTINGS;
  const showApprovedTryOnRelatedPhotos =
    sharePageSettings.includeTryOnResult || sharePageSettings.includeFramedTryOnResult;
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

    if (sharePageSettings.includeOriginalCapture && sourceImageUrl) {
      addUniqueShareVariant({
        id: `${(submission.submissionKind === 'original' ? currentSubmissionId : submission.sourceSubmissionId) ?? currentSubmissionId}:original-capture`,
        imageUrl: sourceImageUrl,
        label: 'Original photo taken',
      });
    }

    if (showApprovedTryOnRelatedPhotos) {
      const variants = await listApprovedShareVariants(db, sourceSubmissionId);
      variants.forEach((variant) => {
        buildTryOnVariantCards(variant, sharePageSettings).forEach((card) => {
          addUniqueShareVariant(card);
        });
      });

      if (
        submission.submissionKind === 'tryon_result' &&
        (submission.reviewStatus === 'approved' || Boolean(submission.isShareVisible))
      ) {
        const variant = {
          _id: { toString: () => currentSubmissionId },
          imageUrl: submission.imageUrl,
          tryOnLeatherSuitId: submission.tryOnLeatherSuitId,
          metadata: {
            compositionEngine: submission.metadata?.compositionEngine,
            tryOnRawResultUrl: submission.metadata?.tryOnRawResultUrl,
          },
        } as const;

        buildTryOnVariantCards(variant, sharePageSettings).forEach((card) => {
          addUniqueShareVariant(card);
        });
      }
    }
  }

  const displayVariants = shareVariants.filter((variant) => {
    if (variant.id.endsWith(':original-capture') && !sharePageSettings.includeOriginalCapture) {
      return false;
    }
    if (variant.id.endsWith(':camera-result') && !sharePageSettings.includeCameraResult) {
      return false;
    }
    return true;
  });

  const featuredVariant = displayVariants[0] ?? null;
  const galleryVariants = featuredVariant ? displayVariants.slice(1) : displayVariants;
  const hasTryOnVariant = displayVariants.some((variant) => variant.isTryOn);
  const downloadableImageUrl = featuredVariant?.imageUrl ?? submission.imageUrl;
  const hasDownloadableImage = Boolean(downloadableImageUrl);
  const imageMissingMessage = sharePageSettings.pendingTryOnMessage;

  const showPendingTryOnMessage =
    submission.submissionKind !== 'tryon_result' &&
    (sharePageSettings.includeTryOnResult || sharePageSettings.includeFramedTryOnResult) &&
    Boolean(submission.tryOnRequest?.requested) &&
    !submission.tryOnRequest?.shareVisible &&
    !hasTryOnVariant;

  // `/capture/[eventId]` expects the event document Mongo `_id`, while submissions often store public `eventId` UUID in `eventIds` / `eventId`.
  let createYourOwnHref = '/capture';
  if (event?.mongoId) {
    createYourOwnHref = `/capture/${event.mongoId}`;
  }

  const headline = event?.name ?? 'Shared photo';

  return (
    <PublicShell size="lg">
      <Stack gap="xl">
        <Stack align="center" gap="xs" ta="center">
          <Title order={1}>
            {headline}
          </Title>
          <Text c="dimmed">
            Photo by{' '}
            <span className="font-semibold">{submission.userName}</span>
          </Text>
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
            {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString() : ''}
          </Text>

          <Group gap="md" grow>
            {hasDownloadableImage ? (
              <Button
                component="a"
                href={downloadableImageUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
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
                {sharePageSettings.includeTryOnResult || sharePageSettings.includeFramedTryOnResult
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
