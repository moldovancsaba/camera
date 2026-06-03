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
  imageUrl: string;
  userName?: string;
  createdAt?: string;
  submissionKind?: 'original' | 'tryon_result';
  sourceSubmissionId?: string | null;
  reviewStatus?: 'pending_review' | 'approved' | 'rejected';
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
  settings: EventSharePageSettings,
  currentSubmissionId: string
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
    });
  }

  if (resultUrl && id !== currentSubmissionId) {
    if (isFramed && settings.includeFramedTryOnResult) {
      cards.push({
        id: `${id}:tryon-framed`,
        imageUrl: resultUrl,
        label: `${suitLabel} - with frame`,
      });
    }

    if (!isFramed && settings.includeTryOnResult) {
      cards.push({
        id: `${id}:tryon-result`,
        imageUrl: resultUrl,
        label: suitLabel,
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

    return {
      title: `Photo by ${userName} — ${eventLabel}`,
      description: `Photo from ${eventLabel}`,
      openGraph: {
        title: `Photo by ${userName}`,
        description: `From ${eventLabel}`,
        images: [
          {
            url: submission.imageUrl,
            width: 1200,
            height: 1200,
            alt: `Photo by ${userName}`,
          },
        ],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: `Photo by ${userName}`,
        description: `From ${eventLabel}`,
        images: [submission.imageUrl],
      },
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
  let shareVariants: ShareVariantCard[] = [];
  let sourceOriginalVariant: ShareVariantCard | null = null;
  
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    const doc = await db
      .collection(COLLECTIONS.SUBMISSIONS)
      .findOne({ _id: new ObjectId(id) });
    if (doc && typeof doc.imageUrl === 'string') {
      submission = {
        id: doc._id.toString(),
        imageUrl: doc.imageUrl,
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
    if (
      sharePageSettings.includeCameraResult &&
      submission.submissionKind === 'tryon_result' &&
      submission.sourceSubmissionId &&
      ObjectId.isValid(submission.sourceSubmissionId)
    ) {
      const sourceDoc = await db
        .collection(COLLECTIONS.SUBMISSIONS)
        .findOne({ _id: new ObjectId(submission.sourceSubmissionId) });
      if (sourceDoc && typeof sourceDoc.imageUrl === 'string') {
        sourceOriginalVariant = {
          id: sourceDoc._id!.toString(),
          imageUrl: sourceDoc.imageUrl,
          label: 'Photo with Camera frame',
        };
      }
    }

    if (
      sharePageSettings.includeOriginalCapture &&
      submission.submissionKind !== 'tryon_result' &&
      submission.tryOnRequest?.sourceImageUrl
    ) {
      shareVariants.push({
        id: `${currentSubmissionId}:original-capture`,
        imageUrl: submission.tryOnRequest.sourceImageUrl,
        label: 'Original photo taken',
      });
    }

    if (showApprovedTryOnRelatedPhotos) {
      const variants = await listApprovedShareVariants(db, sourceSubmissionId);
      shareVariants = [
        ...shareVariants,
        ...variants.flatMap((variant) =>
          buildTryOnVariantCards(variant, sharePageSettings, currentSubmissionId)
        ),
      ];
    }
  }

  const showPendingTryOnMessage =
    submission.submissionKind !== 'tryon_result' &&
    Boolean(submission.tryOnRequest?.requested) &&
    !submission.tryOnRequest?.shareVisible &&
    shareVariants.every((variant) => !variant.id.includes('tryon-'));

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
          <div 
            style={{
              position: 'relative',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 16,
              marginInline: 'auto',
              aspectRatio: submission.metadata?.finalWidth && submission.metadata?.finalHeight 
                ? `${submission.metadata.finalWidth} / ${submission.metadata.finalHeight}`
                : '1',
              maxWidth: '100%',
            }}
          >
            <Image
              src={submission.imageUrl}
              alt="Shared photo"
              fill
              className="object-contain"
              unoptimized
            />
          </div>

          <Text size="sm" c="dimmed" ta="right" mb="lg">
            {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString() : ''}
          </Text>

          <Group gap="md" grow>
            <Button component="a" href={submission.imageUrl} download target="_blank" rel="noopener noreferrer" size="lg">
              Download
            </Button>
            <Button component="a" href={createYourOwnHref} variant="default" size="lg">
              Create Your Own
            </Button>
          </Group>

          {showPendingTryOnMessage ? (
            <Alert color="blue" variant="light" mt="xl">
              {sharePageSettings.pendingTryOnMessage}
            </Alert>
          ) : null}

          {sourceOriginalVariant || shareVariants.length > 0 ? (
            <Stack gap="md" mt="xl">
              <Text fw={700}>
                {submission.submissionKind === 'tryon_result' ? 'Original and approved try-on results' : 'Approved try-on results'}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                {sourceOriginalVariant ? (
                  <Card
                    component="a"
                    key={sourceOriginalVariant.id}
                    href={`/share/${sourceOriginalVariant.id}`}
                    withBorder
                    padding={0}
                    style={{ textDecoration: 'none', color: 'inherit', overflow: 'hidden' }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '1' }}>
                      <Image src={sourceOriginalVariant.imageUrl} alt={sourceOriginalVariant.label} fill unoptimized className="object-cover" />
                    </div>
                    <div style={{ padding: '0.875rem' }}>
                      <Text fw={600} size="sm">
                        {sourceOriginalVariant.label}
                      </Text>
                    </div>
                  </Card>
                ) : null}
                {shareVariants.map((variant) => (
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
