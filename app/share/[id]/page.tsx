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
import { findShareSubmission, shareStateOf, type ShareLookup } from '@/lib/submissions/share-lookup';
import PhotoStatusNotice from '@/components/share/PhotoStatusNotice';
import EventThemeScope from '@/components/theme/EventThemeScope';
import UiLanguageProvider from '@/components/i18n/UiLanguageProvider';
import { loadEventTheme } from '@/lib/theme/load';
import type { EventTheme } from '@/lib/theme/event-theme';
import PublicShell from '@/components/public/PublicPageShell';
import { Alert, Button, Card, SimpleGrid, Stack, Text, Title } from '@/components/gds/PublicPrimitives';
import { listApprovedShareVariants } from '@/lib/tryon/publication';
import {
  DEFAULT_PENDING_TRYON_MESSAGE,
  normalizeEventSharePageSettings,
  pendingTryOnText,
  sharePageText,
  type EventSharePageSettings,
} from '@/lib/events/share-page-settings';
import { DEFAULT_UI_LANGUAGE, normalizeUiLanguage, translate, type UiLanguage } from '@/lib/i18n';
import { loadEventTexts, type TextOverrides } from '@/lib/i18n/overrides';
import { formatDateTime } from '@/lib/i18n/date';
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
  previewImageUrl?: string | null;
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
  texts: {},
};

interface TryOnVariantLike {
  _id?: {
    toString: () => string;
  };
  imageUrl?: string | null;
  finalImageUrl?: string | null;
  previewImageUrl?: string | null;
  tryOnLeatherSuitId?: string | null;
  createdAt?: string | null;
  approvedAt?: string | null;
  metadata?: {
    compositionEngine?: unknown;
    tryOnRawResultUrl?: unknown;
  } | null;
}

export const dynamic = 'force-dynamic';

/** The page in the theme and the language of its event (camera#285, camera#352); a page whose event is unknown keeps the default look, in English. */
function ThemedPage({ theme, language, texts, children }: { theme: EventTheme | null; language: UiLanguage; texts?: TextOverrides | null; children: React.ReactNode }) {
  return theme ? (
    <EventThemeScope theme={theme}>
      <UiLanguageProvider language={language} texts={texts}>{children}</UiLanguageProvider>
    </EventThemeScope>
  ) : (
    <>{children}</>
  );
}

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
): Promise<{ mongoId: string; name: string; sharePageSettings: EventSharePageSettings; theme: EventTheme; language: UiLanguage; texts: TextOverrides } | null> {
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
  // The page speaks the language of the event (camera#352).
  const language = normalizeUiLanguage(eventDoc.uiLanguage);
  // ... with the wordings written for the partner or the event (issue 353); a failed read costs nothing but those wordings.
  const texts = (await loadEventTexts(db, eventDoc).catch(() => null))?.overrides ?? {};
  const name =
    typeof eventDoc.name === 'string' && eventDoc.name.trim()
      ? eventDoc.name.trim()
      : translate(language, 'meta.event', undefined, texts);
  const sharePage = eventDoc.sharePage && typeof eventDoc.sharePage === 'object'
    ? eventDoc.sharePage
    : null;
  return {
    mongoId: eventDoc._id.toString(),
    name,
    sharePageSettings: normalizeEventSharePageSettings(sharePage),
    // The page is drawn with the theme of the event (camera#285).
    theme: await loadEventTheme(db, eventDoc),
    language,
    texts,
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLegacyGuestName(value: string): boolean {
  return value.trim().toLowerCase() === 'event guest';
}

function resolveDisplayName(userName: string | null, userInfoName: string | null, language: UiLanguage, texts?: TextOverrides | null): string {
  const normalizedUserInfoName = userInfoName?.trim();
  if (normalizedUserInfoName && !isLikelyEmail(normalizedUserInfoName) && !isLegacyGuestName(normalizedUserInfoName)) {
    return normalizedUserInfoName;
  }
  const normalizedUserName = userName?.trim();
  if (normalizedUserName && !isLikelyEmail(normalizedUserName) && !isLegacyGuestName(normalizedUserName)) {
    return normalizedUserName;
  }
  return translate(language, 'sharePage.guest', undefined, texts);
}

function buildTryOnVariantCards(
  variant: TryOnVariantLike,
  settings: EventSharePageSettings,
  language: UiLanguage
): ShareVariantCard[] {
  const id = variant._id?.toString() ?? '';
  const metadata = variant.metadata && typeof variant.metadata === 'object'
    ? variant.metadata as { compositionEngine?: unknown; tryOnRawResultUrl?: unknown }
    : {};
  const resultUrl = readString(variant.imageUrl) || readString(variant.finalImageUrl);
  const previewUrl = readString(variant.previewImageUrl);
  const rawResultUrl = readString(metadata.tryOnRawResultUrl);
  const isFramed = (() => {
    if (metadata.compositionEngine === 'motogp_leather_magic_framed') {
      return true;
    }
    return Boolean(resultUrl && rawResultUrl && resultUrl !== rawResultUrl);
  })();
  const suitLabel = readString(variant.tryOnLeatherSuitId) || translate(language, 'sharePage.tryOnApproved');
  const cards: ShareVariantCard[] = [];

  if (settings.includeTryOnResult && rawResultUrl) {
    cards.push({
      id: `${id}:tryon-generated`,
      imageUrl: rawResultUrl,
      label: translate(language, 'sharePage.tryOnGenerated', { suit: suitLabel }),
      isTryOn: true,
    });
  }

  if (resultUrl) {
    if (isFramed && settings.includeFramedTryOnResult) {
      cards.push({
        id: `${id}:tryon-framed`,
        imageUrl: resultUrl,
        previewImageUrl: previewUrl,
        label: translate(language, 'sharePage.tryOnFramed', { suit: suitLabel }),
        isTryOn: true,
      });
    }

    if (!isFramed && settings.includeTryOnResult) {
      cards.push({
        id: `${id}:tryon-result`,
        imageUrl: resultUrl,
        previewImageUrl: previewUrl,
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
    const lookup = await findShareSubmission(db, id);
    const state = shareStateOf(lookup);
    const submission = lookup?.doc ?? null;

    // A photo that is not public (pending, rejected, archived, removed from its events) gets no preview image and is not
    // indexed: a link preview must not leak what the page itself would not show (camera#262, camera#269).
    if ((state === 'waiting' || state === 'not_approved') && submission) {
      // The notice speaks the language of the event, and so does its tab title (camera#352). A failed event lookup must not cost the
      // noindex: the title is then English.
      const noticeEvent = await resolveEventForSubmission(db, submission).catch(() => null);
      const noticeLanguage = noticeEvent?.language ?? DEFAULT_UI_LANGUAGE;
      return {
        title: translate(noticeLanguage, 'sharePage.meta.yourPhoto', undefined, noticeEvent?.texts),
        // The product's description, as the root layout gives every page; here in the event's language.
        description: translate(noticeLanguage, 'meta.app.description', undefined, noticeEvent?.texts),
        robots: { index: false, follow: false },
      };
    }
    // The page is not found (Next's own page, which does not know the event), so its title stays English.
    if (!submission || state !== 'visible') {
      return {
        title: translate(DEFAULT_UI_LANGUAGE, 'sharePage.meta.notFound'),
        robots: { index: false, follow: false },
      };
    }

    const event = await resolveEventForSubmission(db, submission);
    const language = event?.language ?? DEFAULT_UI_LANGUAGE;
    const eventLabel = event?.name ?? translate(language, 'sharePage.sharedPhoto', undefined, event?.texts);
    const displayName = resolveDisplayName(
      readString(submission.userName),
      readString(submission.userInfo?.name),
      language,
      event?.texts
    );
    const photoOf = translate(language, 'sharePage.meta.photoOf', { name: displayName }, event?.texts);
    const from = translate(language, 'sharePage.meta.from', { event: eventLabel }, event?.texts);
    const submissionImageUrl = readString(submission.imageUrl);
    const openGraph: NonNullable<Metadata['openGraph']> = {
      title: photoOf,
      description: from,
      type: 'website',
    };
    const twitter: NonNullable<Metadata['twitter']> = {
      card: submissionImageUrl ? 'summary_large_image' : 'summary',
      title: photoOf,
      description: from,
    };

    if (submissionImageUrl) {
      openGraph.images = [
        {
          url: submissionImageUrl,
          width: 1200,
          height: 1200,
          alt: photoOf,
        },
      ];
      twitter.images = [submissionImageUrl];
    }

    return {
      title: translate(language, 'sharePage.meta.title', { name: displayName, event: eventLabel }, event?.texts),
      description: translate(language, 'sharePage.meta.description', { event: eventLabel }, event?.texts),
      openGraph,
      twitter,
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: translate(DEFAULT_UI_LANGUAGE, 'sharePage.meta.photo'),
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
  
  let lookup: ShareLookup | null = null;
  try {
    const { id } = await params;
    const db = await connectToDatabase();
    // The link carries the database id or the share token of a vetted photo (camera#269).
    lookup = await findShareSubmission(db, id);
    const doc = lookup?.doc ?? null;
    if (doc && typeof doc === 'object' && shareStateOf(lookup) === 'visible') {
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

  // A vetted photo reached by its token that is waiting or was not approved: a notice, never the photo (camera#269).
  const shareState = shareStateOf(lookup);
  if ((shareState === 'waiting' || shareState === 'not_approved') && lookup) {
    const noticeDb = await connectToDatabase();
    const noticeEvent = await resolveEventForSubmission(noticeDb, lookup.doc);
    const noticeLanguage = noticeEvent?.language ?? DEFAULT_UI_LANGUAGE;
    return (
      <ThemedPage theme={noticeEvent?.theme ?? null} language={noticeLanguage} texts={noticeEvent?.texts}>
        <PhotoStatusNotice
          state={shareState}
          eventName={noticeEvent?.name ?? translate(noticeLanguage, 'sharePage.sharedPhoto', undefined, noticeEvent?.texts)}
          captureHref={noticeEvent?.mongoId ? `/capture/${noticeEvent.mongoId}` : '/capture'}
          settings={noticeEvent?.sharePageSettings}
          language={noticeLanguage}
        />
      </ThemedPage>
    );
  }

  if (!submission) {
    notFound();
  }

  const db = await connectToDatabase();
  const event = await resolveEventForSubmission(db, submission as unknown as Record<string, unknown>);
  const language = event?.language ?? DEFAULT_UI_LANGUAGE;
  const texts = event?.texts ?? null;
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
            label: translate(language, 'sharePage.cameraResult', undefined, texts),
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
            label: translate(language, 'sharePage.cameraResult', undefined, texts),
          });
        }
      }
    }

    if (enforcedSharePageSettings.includeOriginalCapture && sourceImageUrl) {
      addUniqueShareVariant({
        id: `${(submission.submissionKind === 'original' ? currentSubmissionId : submission.sourceSubmissionId) ?? currentSubmissionId}:original-capture`,
        imageUrl: sourceImageUrl,
        label: sharePageText(sharePageSettings, 'originalPhotoLabel', language, texts),
      });
    }

    if (showApprovedTryOnRelatedPhotos) {
      const variants = await listApprovedShareVariants(db, sourceSubmissionId);
      const variantCandidates: TryOnVariantLike[] = variants.map((variant) => ({
        _id: { toString: () => variant._id.toString() },
        imageUrl: variant.imageUrl,
        finalImageUrl: variant.finalImageUrl,
        previewImageUrl: variant.previewImageUrl ?? null,
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
              previewImageUrl: submission.previewImageUrl ?? null,
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
        buildTryOnVariantCards(variant, enforcedSharePageSettings, language).forEach((card) => {
          addUniqueShareVariant(card);
        });
      });

      if (enforcedSharePageSettings.includeCheckedInTryOnResult) {
        const checkedInVariant = pickFirstCheckedInTryOnVariantCard(
          variantCandidates,
          enforcedSharePageSettings,
          language
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
  const pendingTryOnMessage = pendingTryOnText(sharePageSettings, language, texts);

  const showPendingTryOnMessage =
    hasTryOnRequest &&
    submission.submissionKind !== 'tryon_result' &&
    (!hasTryOnVariant || submission.tryOnRequest?.shareVisible === false);

  // `/capture/[eventId]` expects the event document Mongo `_id`, while submissions often store public `eventId` UUID in `eventIds` / `eventId`.
  let createYourOwnHref = '/capture';
  if (event?.mongoId) {
    createYourOwnHref = `/capture/${event.mongoId}`;
  }

  const headline = event?.name ?? translate(language, 'sharePage.sharedPhoto', undefined, texts);
  return (
    <ThemedPage theme={event?.theme ?? null} language={language} texts={texts}>
    <PublicShell size="lg">
      <Stack gap="xl">
        <Stack align="center" gap="xs" ta="center">
          <Title order={1} size="1.5rem">
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
              {pendingTryOnMessage}
            </Text>
          )}

          <Text size="sm" c="dimmed" ta="right" mb="lg">
            {submission.createdAt ? formatDateTime(submission.createdAt, language) : ''}
          </Text>

          {/* The two buttons sit one under the other on a phone: side by side, half a phone wide, the themed capitals of "Download" and of a
              Hungarian label were clipped (camera#352). Side by side again from the small breakpoint up; a single button is always full width. */}
          <SimpleGrid cols={{ base: 1, xs: sharePageSettings.showCreateYourOwnButton ? 2 : 1 }} spacing="md">
            {downloadableImageHref ? (
              <Button
                component="a"
                href={downloadableImageHref}
                download
                size="lg"
              >
                {sharePageText(sharePageSettings, 'downloadButton', language, texts)}
              </Button>
            ) : (
              <Button size="lg" disabled>
                {sharePageText(sharePageSettings, 'downloadButton', language, texts)}
              </Button>
            )}
            {sharePageSettings.showCreateYourOwnButton ? (
              <Button component="a" href={createYourOwnHref} variant="default" size="lg">
                {sharePageText(sharePageSettings, 'createYourOwnButton', language, texts)}
              </Button>
            ) : null}
          </SimpleGrid>

          {showPendingTryOnMessage && featuredVariant ? (
            <Alert color="blue" variant="light" mt="xl">
              {pendingTryOnMessage}
            </Alert>
          ) : null}

          {galleryVariants.length > 0 ? (
            <Stack gap="md" mt="xl">
              <Text fw={700}>
            {sharePageText(sharePageSettings, 'relatedPhotosTitle', language, texts)}
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
                      <Image src={variant.previewImageUrl || variant.imageUrl} alt={variant.label} fill unoptimized className="object-cover" />
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
    </ThemedPage>
  );
}
