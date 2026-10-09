/**
 * Event-Specific Capture Page
 * 
 * Public page for capturing photos at events
 * Full interactive capture flow with camera/upload support
 * 
 * Custom page flow system
 * - Sorted custom pages are read in their configured order.
 * - Pages before [Take Photo] are rendered before capture.
 * - [Take Photo] represents the capture step.
 * - Pages after [Take Photo] are rendered after sharing.
 * - Collects user data (name/email) and consents before or after capture based on configured order.
 */

'use client';

import { Fragment, useState, useEffect, use, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@mantine/core';
import CameraCapture from '@/components/camera/CameraCapture';
import AppShellLock from '@/components/capture/AppShellLock';
import { clearCaptureNotices, notifyCapture } from '@/components/capture/notify';
import ShareOverlay from '@/components/capture/ShareOverlay';
import ProcessingOverlay from '@/components/capture/ProcessingOverlay';
import PendingPhotoPreview from '@/components/capture/PendingPhotoPreview';
import TourOverlay from '@/components/tour/TourOverlay';
import TourReplayButton from '@/components/tour/TourReplayButton';
import { useTourController } from '@/lib/tour/useTourController';
import {
  getCaptureSelectFrameSteps,
  getCapturePhotoSteps,
  getCapturePreviewSteps,
} from '@/lib/tour/config/captureTourSteps';
import WhoAreYouPage, { type WhoAreYouPageData } from '@/components/capture/WhoAreYouPage';
import AcceptPage, { type AcceptPageData } from '@/components/capture/AcceptPage';
import { consentRecords } from '@/lib/events/consent';
import { approvalTexts } from '@/lib/events/page-texts';
import { useT, useUiTexts } from '@/components/i18n/UiLanguageProvider';
import { translate, type MessageKey, type MessageValues, type UiLanguage } from '@/lib/i18n';
import { errorText } from '@/lib/i18n/errors';
import CTAPage, { type CTAPageData } from '@/components/capture/CTAPage';
import RestartPage from '@/components/capture/RestartPage';
import WelcomePage from '@/components/capture/WelcomePage';
import TryOnSuitSelector from '@/components/tryon/TryOnSuitSelector';
import { type CustomPage } from '@/lib/db/schemas';
import { loadImageAspectRatio } from '@/lib/camera/frame-preview-aspect';
import ReframeStep, { type ReframeResult } from '@/components/camera/ReframeStep';
import type { FullFrameCapture } from '@/lib/camera/frame-capture';
import { frameSilhouette } from '@/lib/frame/silhouette';
import { pickVariant, territoriesOf, type CaptureFrame, type CaptureVariant, type Territory } from '@/lib/frame/capture';
import { NO_CHOICE, chooseLayout, drawOwnFrame, drawVariant, layoutIdOf, layoutsToChoose, messagesToChoose, nextStep, variantKeyOf, type Choice } from '@/lib/frame/choose';
import { storedFrameSelection } from '@/lib/frame/selection';
import SystemCameraCapture from '@/components/camera/SystemCameraCapture';
import { captureOverride, chooseCaptureMethod, hasStillCapture, type CaptureMethod } from '@/lib/camera/still-capture';
import { pickRandom } from '@/lib/slots/resolve';
import { detectTouchPrimaryDevice } from '@/lib/camera/constraints';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
} from '@/lib/gds/tokens/colors';
import {
  normalizeEventButtonSize,
  type EventButtonSize,
} from '@/lib/events/visual-settings';

interface Frame {
  frameId: string;
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  /** Set when this is the image of the generated default frame picked for one shutter press (camera#236). */
  generated?: { index: number | null; message: string | null; territories: Territory[] };
}

interface EventData {
  eventId: string;
  name: string;
  partnerId: string | null;
  partnerName: string | null;
  eventDate: string | null;
  location: string | null;
  customPages: CustomPage[];  // Custom page flow
  loadingText?: string;  // Customizable loading text
  tourEnabled?: boolean; // The guided tour is off unless the event turns it on (camera#356)
  logoUrl?: string;  // Optional event logo URL
  showLogo: boolean;  // Whether to display logo on pages
  brandColor?: string;  // Primary brand color (hex)
  brandBorderColor?: string;  // Border/accent color (hex)
  visualSettings?: {
    buttonSize?: EventButtonSize;
  };
  frames?: EventFrameAssignment[];
  /** The generated default frame, present only while the event has no active frame of its own (camera#236). */
  generatedFrame?: CaptureFrame | null;
  /** Photo vetting is required (camera#263): the photo waits for approval, and the real frame is never shown before it. */
  photoVettingRequired?: boolean;
  /** The picture of the giant screen drawn from the event's default slideshow (issue 327): shown on a welcome page that has no picture of its own. */
  welcomeScreen?: { url: string };
  /** How users get the layout and the message (epic 444): the editor's setting; the page reads it through `generatedFrame.selection`, and for the event's own frames from here. */
  frameSelection?: unknown;
  tryOn?: {
    enabled: boolean;
    setupId?: string | null;
    allowedLeatherSuitIds?: string[];
    outfitEnabled?: boolean;
  };
  notifications?: {
    submissionResultEmailEnabled?: boolean;
    submissionResultEmailSendAfterSave?: boolean;
    submissionResultEmailSendAfterRelatedPhotosReady?: boolean;
    submissionResultEmailSubject?: string | null;
    submissionResultEmailBody?: string | null;
    submissionResultEmailSubjectAfterSave?: string | null;
    submissionResultEmailBodyAfterSave?: string | null;
    submissionResultEmailSubjectAfterRelatedPhotosReady?: string | null;
    submissionResultEmailBodyAfterRelatedPhotosReady?: string | null;
  };
}

interface EventFrameAssignment {
  frameId: string;
  isActive: boolean;
  /** The library item behind the assignment, as the event data carries it (null when the item no longer exists). */
  frameDetails?: { frameId: string; name?: string; imageUrl?: string; width?: number; height?: number; isActive?: boolean; createdAt?: string; hasMessageArea?: boolean } | null;
}

interface EventLogo {
  imageUrl: string;
  isActive: boolean;
}

interface EventLogosResponse {
  data?: {
    logos?: Record<string, EventLogo[]>;
  };
  logos?: Record<string, EventLogo[]>;
}

// Collected data from custom pages
interface CollectedData {
  userInfo?: WhoAreYouPageData;
  consents: Array<{
    pageId: string;
    pageType: 'accept' | 'cta';
    checkboxText: string;
    linkUrl?: string;
    accepted: boolean;
    acceptedAt: string;
  }>;
}

interface TryOnSubmissionResult {
  requested: boolean;
  status: 'not_requested' | 'queued' | 'deduplicated' | 'enqueue_failed';
  leatherSuitId: string | null;
  jobId: string | null;
  error: string | null;
}

interface SubmissionEmailMetadata {
  emailSent?: boolean;
  emailSentAt?: string | null;
  emailRecipient?: string | null;
  emailProvider?: string | null;
  emailMessageId?: string | null;
  emailSkipReason?: string | null;
  emailFailedAt?: string | null;
  emailError?: string | null;
  emailSendAfterRelatedPending?: boolean;
}

// The actions beside or below the preview image. The options scroll inside the panel; the buttons stay
// pinned, so a tall try-on selector never pushes them off screen (camera#222).
const PREVIEW_PANEL_CLASS =
  'flex w-full max-w-md min-h-0 shrink flex-col gap-2 overflow-y-auto px-3 [&>:first-child]:my-auto landscape:h-full landscape:w-[22rem] landscape:max-w-[45%] landscape:shrink-0';

function getErrorMessage(error: unknown, language: UiLanguage): string {
  return error instanceof Error ? error.message : translate(language, 'flow.unexpectedError');
}

function splitCustomPages(
  pages: CustomPage[]
): {
  onboardingPages: CustomPage[];
  thankYouPages: CustomPage[];
  takePhotoPage: CustomPage | undefined;
} {
  const sortedPages = [...pages].sort((a, b) => a.order - b.order);
  const takePhotoPage = sortedPages.find((page) => page.pageType === 'take-photo');
  const takePhotoIndex = sortedPages.findIndex((page) => page.pageType === 'take-photo');

  if (takePhotoIndex === -1) {
    return {
      onboardingPages: sortedPages,
      thankYouPages: [],
      takePhotoPage: undefined,
    };
  }

  const onboardingPages = sortedPages.slice(0, takePhotoIndex).filter((page) => page.pageType !== 'take-photo');
  const thankYouPages = sortedPages
    .slice(takePhotoIndex + 1)
    .filter((page) => page.pageType !== 'take-photo');

  return { onboardingPages, thankYouPages, takePhotoPage };
}

function buildEmailDeliveryNotice(metadata: SubmissionEmailMetadata | null | undefined, language: UiLanguage): string {
  const t = (key: MessageKey, values?: MessageValues) => translate(language, key, values);
  if (!metadata) {
    return '';
  }
  if (metadata.emailSent) {
    return t('flow.email.sent', { recipient: metadata.emailRecipient || t('flow.email.recipientFallback') });
  }
  if (metadata.emailSkipReason === 'event_email_disabled') {
    return t('flow.email.disabled');
  }
  if (metadata.emailSkipReason === 'missing_recipient') {
    return t('flow.email.missingRecipient');
  }
  if (metadata.emailSkipReason === 'missing_api_key') {
    return t('flow.email.missingKey');
  }
  if (metadata.emailSkipReason === 'missing_from_address') {
    return t('flow.email.missingFrom');
  }
  if (metadata.emailSendAfterRelatedPending) {
    return t('flow.email.waitingRelated');
  }
  if (metadata.emailFailedAt && metadata.emailError) {
    return t('flow.email.failed', { error: metadata.emailError });
  }
  return '';
}

/** The generated default frame's image for one shutter press, in the shape the composite step already uses. */
function variantFrame(variant: CaptureVariant): Frame {
  return {
    frameId: '',
    name: 'Default event frame',
    imageUrl: variant.imageUrl,
    width: variant.width,
    height: variant.height,
    generated: { index: variant.index, message: variant.message, territories: territoriesOf(variant) },
  };
}

export default function EventCapturePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const { t, own, language } = useT();
  const uiTexts = useUiTexts();
  
  const [event, setEvent] = useState<EventData | null>(null);
  const [loadingLogoUrl, setLoadingLogoUrl] = useState<string | null>(null);
  const [onboardingLogoUrl, setOnboardingLogoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  // The generated default frame of an event without a frame of its own (camera#236): the guest never sees a picker,
  // each shutter press takes a random variant (never the one before) and the live view and reframe show territories.
  const [generatedFrame, setGeneratedFrame] = useState<CaptureFrame | null>(null);
  const lastVariantIndex = useRef<number | null>(null);
  // Under the editor's setting (epic 444): what the user chose so far, and the image or frame of the last photo, so a new draw is never the same twice in a row.
  const [choice, setChoice] = useState<Choice>(NO_CHOICE);
  const lastDrawKey = useRef<string | null>(null);
  // One draw per visit for the random pick of the logo: the same draw in every place, so a user sees the same logo throughout (camera#419).
  const logoDraw = useRef<number | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  // The whole photo at the camera's full size, held in the browser for the reframe step only: the guest zooms and pans
  // anywhere in it, and only the frame-sized result is saved. The photo itself is dropped (owner decision 2026-10-06).
  const [capturedOriginal, setCapturedOriginal] = useState<FullFrameCapture | null>(null);
  // How the photo is taken in this environment (camera#257): the device's own camera on every touch device, a real still or
  // the video frame on a desktop webcam. Known after mount.
  const [captureMethod, setCaptureMethod] = useState<CaptureMethod | null>(null);
  useEffect(() => {
    setCaptureMethod(
      chooseCaptureMethod({ touchPrimary: detectTouchPrimaryDevice(), stillCapture: hasStillCapture(), override: captureOverride(window.location.search) })
    );
  }, []);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  // Photo vetting (camera#265): the photo is saved and waits for approval. No share link exists yet.
  const [pendingApproval, setPendingApproval] = useState(false);
  // An own frame as a 50% black silhouette, shown instead of the real frame while the photo of a vetted event waits.
  const [silhouetteUrl, setSilhouetteUrl] = useState<string | null>(null);
  const [step, setStep] = useState<'select-frame' | 'select-layout' | 'select-message' | 'capture-photo' | 'reframe' | 'preview'>('select-frame');
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  /** Intrinsic frame bitmap aspect (w/h); preview matches composite via `previewAspectWidthOverHeight`. */
  const [frameIntrinsicAspect, setFrameIntrinsicAspect] = useState<number | null>(null);
  const [savedSubmissionId, setSavedSubmissionId] = useState<string | null>(null);
  const [isFinalizingSubmission, setIsFinalizingSubmission] = useState(false);
  const [hasFinalizedSubmissionEmail, setHasFinalizedSubmissionEmail] = useState(false);

  // Custom page flow state
  const [customPages, setCustomPages] = useState<CustomPage[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [collectedData, setCollectedData] = useState<CollectedData>({ consents: [] });
  const [flowPhase, setFlowPhase] = useState<'onboarding' | 'capture' | 'thankyou'>('onboarding');
  const [signInError, setSignInError] = useState<{ code: string; message: string } | null>(null);
  const [selectedTryOnSuitId, setSelectedTryOnSuitId] = useState<string | null>(null);
  const [selectedTryOnBottomSuitId, setSelectedTryOnBottomSuitId] = useState<string | null>(null);
  const [tryOnResult, setTryOnResult] = useState<TryOnSubmissionResult | null>(null);
  const [cameraId, setCameraId] = useState<string | null>(null);
  // Continue on the reframe screen saves the photo (camera#344): true from that press until the save starts, so nothing else is asked in between.
  const [saveRequested, setSaveRequested] = useState(false);
  const vetted = event?.photoVettingRequired === true;
  
  const { onboardingPages, thankYouPages, takePhotoPage } = splitCustomPages(customPages);

  // Keep camera scope identifier for per-event/camera try-on setup resolution.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const cameraIdParam = (urlParams.get('cameraId') || urlParams.get('camera_id') || '').trim();
    if (cameraIdParam) {
      setCameraId(cameraIdParam);
    }
  }, []);

  // Get take-photo page config for button texts and messages
  const configuredTakePhotoPage = takePhotoPage;
  const hasAnyOnboardingPages = onboardingPages.length > 0;
  const hasAnyThankYouPages = thankYouPages.length > 0;

  // Every default text comes from the dictionary of the event's language; a text the editor wrote on the selfie-taking page wins, and a stored
  // English default (the page editor saved the defaults as if they were its own) counts as not set in another language (camera#352).
  const takePhotoConfig = configuredTakePhotoPage?.config;
  const shareNextButtonText = own('flow.next', takePhotoConfig?.shareNextButtonText);
  const changeButtonText = own('flow.change', takePhotoConfig?.changeButtonText);
  const successMessage = own('flow.success', takePhotoConfig?.successMessage);
  const showSharePage = takePhotoConfig?.showSharePage !== false;
  const skipShareMessage = own('flow.skipShare', takePhotoConfig?.skipShareMessage);
  // Photo vetting (camera#265): what the user reads while the photo waits for approval; the selfie-taking page can replace each text (camera#333).
  const {
    previewNotice: pendingPreviewNotice,
    savedMessage: pendingSavedMessage,
    savedMessageIsOwn: pendingSavedMessageIsOwn,
    title: pendingTitle,
    waitingMessage: pendingWaitingMessage,
  } = approvalTexts(takePhotoConfig, Boolean(selectedTryOnSuitId), language, uiTexts);
  const cameraPromptTitle = own('camera.ready.title', takePhotoConfig?.cameraPromptTitle);
  const cameraPromptDescription = own('camera.prompt.desktop', takePhotoConfig?.cameraPromptDescription);
  const errorFrameMessage = own('flow.errorFrame', takePhotoConfig?.errorFrameMessage);
  const errorSaveMessage = own('flow.errorSave', takePhotoConfig?.errorSaveMessage);
  const linkCopiedMessage = own('flow.linkCopied', takePhotoConfig?.linkCopiedMessage);
  const copyErrorMessage = own('flow.copyError', takePhotoConfig?.copyErrorMessage);
  const saveFirstMessage = own('flow.saveFirst', takePhotoConfig?.saveFirstMessage);
  const shareScreenTitle = own('share.title', takePhotoConfig?.shareScreenTitle);
  const shareCopyLinkButtonText = own('share.copy', takePhotoConfig?.shareCopyLinkButtonText);
  const shareViewPhotoButtonText = own('share.view', takePhotoConfig?.shareViewPhotoButtonText);
  const shareSuggestedMessageLabel = own('flow.shareSuggested', takePhotoConfig?.shareSuggestedMessageLabel);
  const shareSocialCaptionTemplateRaw = takePhotoConfig?.shareSocialCaptionTemplate?.trim();
  const shareCaptionForSocial = shareSocialCaptionTemplateRaw
    ? shareSocialCaptionTemplateRaw.replace(
        /\{event\}/gi,
        () => event?.name?.trim() || ''
      )
    : event?.name?.trim()
      ? t('flow.shareCaption.event', { event: event.name.trim() })
      : t('flow.shareCaption.plain');
  const eventButtonSize = normalizeEventButtonSize(event?.visualSettings?.buttonSize);

  // The guided tour is off by design; only an event that turns it on gets it (camera#356).
  const tourEnabled = event?.tourEnabled === true;
  const selectFrameTour = useTourController('capture:select-frame:v1', getCaptureSelectFrameSteps(language), {
    autoStart: tourEnabled && step === 'select-frame',
  });
  const photoTour = useTourController(
    'capture:photo:v1',
    getCapturePhotoSteps({ hasMultipleFrames: frames.length > 1, method: captureMethod, language }),
    { autoStart: tourEnabled && step === 'capture-photo' }
  );
  const previewTour = useTourController('capture:preview:v1', getCapturePreviewSteps(language), {
    autoStart: tourEnabled && step === 'preview' && !!shareUrl && showSharePage,
  });

  // Check for SSO resume after authentication
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isResume = urlParams.get('resume') === 'true';
    const resumePageIndex = urlParams.get('page');
    
    // Only process resume once and only if explicitly signaled
    if (isResume && resumePageIndex !== null) {
      const pageIndex = parseInt(resumePageIndex, 10);
      
      if (!isNaN(pageIndex)) {
        // Fetch session to get authenticated user data
        fetch('/api/auth/session')
          .then(res => res.json())
          .then(sessionData => {
            if (sessionData.authenticated && sessionData.user) {
              // Auto-populate userInfo from authenticated session
              setCollectedData(prev => ({
                ...prev,
                userInfo: {
                  name: sessionData.user.name || '',
                  email: sessionData.user.email || '',
                },
              }));
              
              // Advance to next page (skip who-are-you since we have the data)
              setCurrentPageIndex(pageIndex + 1);
              setFlowPhase('onboarding');
            }
            
            // Clean URL to prevent re-processing on refresh
            window.history.replaceState({}, '', window.location.pathname);
          })
          .catch(err => {
            console.warn('Failed to fetch session during resume:', err);
            // Clean URL even on error
            window.history.replaceState({}, '', window.location.pathname);
          });
      } else {
        // Invalid page index, just clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []); // Empty deps array - only run once on mount

  // OAuth / SSO sign-in failed (callback redirected here with ?error=&message=)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const err = urlParams.get('error');
    if (!err) return;

    const rawMsg = urlParams.get('message');
    let message = rawMsg || err.replace(/_/g, ' ');
    if (rawMsg) {
      try {
        message = decodeURIComponent(rawMsg);
      } catch {
        /* keep raw */
      }
    }
    setSignInError({ code: err, message });

    urlParams.delete('error');
    urlParams.delete('message');
    const qs = urlParams.toString();
    window.history.replaceState(
      {},
      '',
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  }, []);

  // Fetch event and frames
  useEffect(() => {
    async function fetchData() {
      try {
        // Check if we're resuming from SSO - if so, don't reset flow state
        const urlParams = new URLSearchParams(window.location.search);
        const isResume = urlParams.get('resume') === 'true';
        
      // As a guest: a vetted event with no "who are you" page before the photo gets the default one first (camera#264).
      const response = await fetch(`/api/events/${eventId}?audience=guest`);
        if (!response.ok) throw new Error('Event not found');
        
        const data = await response.json();
        // apiSuccess wraps in { success: true, data: { event: {...} } }
        const eventData = data.data?.event || data.event;  // Support both structures
        
        if (!eventData) throw new Error('Event data not found');
        
        // MongoDB returns _id (string) and eventId (UUID)
        // We use _id for the URL but event has both fields
        setEvent({
          eventId: eventData.eventId || eventData._id,  // fallback to _id if eventId missing
          name: eventData.name,
          partnerId: eventData.partnerId || null,
          partnerName: eventData.partnerName || null,
          eventDate: eventData.eventDate || null,
          location: eventData.location || null,
          customPages: eventData.customPages || [],
          loadingText: eventData.loadingText,
          tourEnabled: eventData.tourEnabled === true,
          logoUrl: eventData.logoUrl,
          showLogo: eventData.showLogo || false,
          brandColor: eventData.brandColor,
          brandBorderColor: eventData.brandBorderColor,
          visualSettings: {
            buttonSize: normalizeEventButtonSize(eventData.visualSettings?.buttonSize),
          },
          tryOn: eventData.tryOn,
          generatedFrame: eventData.generatedFrame ?? null,
          frameSelection: eventData.frameSelection ?? null,
          photoVettingRequired: eventData.photoVettingRequired === true,
        });
        
        // Fetch logos for loading-capture and onboarding-thankyou scenarios
        try {
          const logoResponse = await fetch(`/api/events/${eventId}/logos`);
          if (logoResponse.ok) {
            const logoData: EventLogosResponse = await logoResponse.json();
            
            // Loading logo
            const loadingLogos = logoData.data?.logos?.['loading-capture'] || logoData.logos?.['loading-capture'] || [];
            // One logo is used as it is; several are picked at random, once per visit (the same draw for every place, so the user sees the same one throughout).
            if (logoDraw.current === null) logoDraw.current = Math.random();
            const draw = logoDraw.current;
            const activeLoadingLogo = pickRandom(loadingLogos.filter((logo) => logo.isActive), () => draw);
            if (activeLoadingLogo) {
              setLoadingLogoUrl(activeLoadingLogo.imageUrl);
            }
            
            // Onboarding/thank you logo
            const onboardingLogos = logoData.data?.logos?.['onboarding-thankyou'] || logoData.logos?.['onboarding-thankyou'] || [];
            const activeOnboardingLogo = pickRandom(onboardingLogos.filter((logo) => logo.isActive), () => draw);
            if (activeOnboardingLogo) {
              setOnboardingLogoUrl(activeOnboardingLogo.imageUrl);
            }
          }
        } catch (err) {
          console.warn('Failed to fetch logos:', err);
        }
        
        // Set up the custom page flow
        const pages = (eventData.customPages || []).filter((p: CustomPage) => p.isActive);
        if (pages.length > 0) {
          const { onboardingPages: resolvedOnboardingPages } = splitCustomPages(pages);
          setCustomPages([...pages].sort((a, b) => a.order - b.order));
          
          // Only set initial flow state if NOT resuming from SSO
          // SSO resume logic will set the correct page index
          if (!isResume) {
            // Start onboarding if any onboarding page is configured, else capture
            if (resolvedOnboardingPages.length > 0) {
              setFlowPhase('onboarding');
              setCurrentPageIndex(0);
            } else {
              setFlowPhase('capture');
            }
          }
        } else {
          // No custom pages, so go straight to capture
          if (!isResume) {
            setFlowPhase('capture');
          }
        }

        // Get frames assigned to this event
        // A text-free frame with a message area carries the event's messages (camera#366); it is not a frame the guest picks.
        const activeFrameAssignments: EventFrameAssignment[] = (eventData.frames || []).filter((frame: EventFrameAssignment) => frame.isActive && frame.frameDetails?.hasMessageArea !== true);
        const frameIds = activeFrameAssignments.map((frame: EventFrameAssignment) => frame.frameId);

        if (frameIds.length > 0) {
          // The frames of this event: the active library items behind its active assignments, newest first, read from the event data itself
          // (a separate list of the library would miss an event's own uploads, camera#361).
          const eventFrames: Frame[] = activeFrameAssignments
            .map((assignment: EventFrameAssignment) => assignment.frameDetails)
            .filter((details): details is NonNullable<EventFrameAssignment['frameDetails']> => !!details && details.isActive !== false && typeof details.imageUrl === 'string' && details.imageUrl.length > 0)
            .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
            .map((details) => ({ frameId: details.frameId, name: details.name ?? '', imageUrl: details.imageUrl as string, width: details.width ?? 0, height: details.height ?? 0 }));
          setFrames(eventFrames);
          
          // Auto-select if only one frame
          if (eventFrames.length === 1) {
            setSelectedFrame(eventFrames[0]);
            setStep('capture-photo');
          } else if (eventFrames.length > 1 && storedFrameSelection(eventData.frameSelection)?.layout.mode !== 'user' && storedFrameSelection(eventData.frameSelection)) {
            // The editor picks the frame or it is random (epic 444): there is no frame step, the frame is drawn when the camera step opens.
            setStep('capture-photo');
          }
        } else {
          // No frame of its own: the generated frame if there is one, else no frame at all. Under the editor's setting the user is asked for the design and the message first when they choose.
          setGeneratedFrame(eventData.generatedFrame ?? null);
          setStep(nextStep(eventData.generatedFrame ?? null, NO_CHOICE));
        }
      } catch (error) {
        console.error('Error fetching event data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [eventId]);

  useEffect(() => {
    if (!selectedFrame?.imageUrl || selectedFrame.generated) {
      setFrameIntrinsicAspect(null);
      return;
    }
    let cancelled = false;
    void loadImageAspectRatio(selectedFrame.imageUrl).then(
      (aspect) => {
        if (!cancelled) setFrameIntrinsicAspect(aspect);
      },
      () => {
        if (!cancelled) setFrameIntrinsicAspect(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [selectedFrame?.frameId, selectedFrame?.imageUrl, selectedFrame?.generated]);

  // The own frame of a vetted event is shown as a silhouette, never as the real frame (camera#265).
  const ownFrameUrl = selectedFrame && !selectedFrame.generated ? selectedFrame.imageUrl : null;
  useEffect(() => {
    if (!vetted || !ownFrameUrl) {
      setSilhouetteUrl(null);
      return;
    }
    let cancelled = false;
    void frameSilhouette(ownFrameUrl).then((url) => {
      if (!cancelled) setSilhouetteUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [vetted, ownFrameUrl]);

  const compositeImageWithFrame = useCallback(async () => {
    if (!capturedImage || !selectedFrame) return;

    setIsProcessing(true);

    try {
      // Load captured photo
      const photoImg = new window.Image();
      photoImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        photoImg.onload = resolve;
        photoImg.onerror = reject;
        photoImg.src = capturedImage;
      });

      // Load frame
      const frameImg = new window.Image();
      frameImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        frameImg.onload = resolve;
        frameImg.onerror = reject;
        frameImg.src = selectedFrame.imageUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const maxDimension = 2048;
      let targetWidth = frameImg.width;
      let targetHeight = frameImg.height;
      
      if (targetWidth > maxDimension || targetHeight > maxDimension) {
        const scale = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
        targetWidth = Math.floor(targetWidth * scale);
        targetHeight = Math.floor(targetHeight * scale);
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      setImageDimensions({ width: targetWidth, height: targetHeight });
      ctx.drawImage(photoImg, 0, 0, canvas.width, canvas.height);
      // A vetted event gets its plain photo: the frame is put on by the server once the photo is approved (camera#265).
      if (!vetted) ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

      const composite = canvas.toDataURL('image/jpeg', 0.85);
      setCompositeImage(composite);
    } catch (error) {
      console.error('Error compositing image:', error);
      notifyCapture('error', errorFrameMessage);
      // Back on the reframe screen with Continue ready, so the user can press it again.
      setSaveRequested(false);
      setCapturedImage(null);
    } finally {
      setIsProcessing(false);
    }
  }, [capturedImage, errorFrameMessage, selectedFrame, vetted]);

  // Composite image with frame when photo is captured (or just use photo if no frame)
  useEffect(() => {
    if (capturedImage) {
      if (selectedFrame) {
        void compositeImageWithFrame();
      } else {
        // No frame - use captured image, optionally resize to 16:9 aspect ratio
        // For frameless events, keep the maximum camera view in 16:9
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setCompositeImage(capturedImage);
            return;
          }
          
          // Calculate 16:9 dimensions from image
          const targetAspect = 16 / 9;
          const imgAspect = img.width / img.height;
          
          let targetWidth = img.width;
          let targetHeight = img.height;
          
          // If image is not 16:9, crop to 16:9 (take center portion)
          if (Math.abs(imgAspect - targetAspect) > 0.01) {
            if (imgAspect > targetAspect) {
              // Image is wider than 16:9, crop width
              targetWidth = img.height * targetAspect;
              targetHeight = img.height;
            } else {
              // Image is taller than 16:9, crop height
              targetWidth = img.width;
              targetHeight = img.width / targetAspect;
            }
          }
          
          // Limit size to max 2048px on longest side
          const maxDimension = 2048;
          if (targetWidth > maxDimension || targetHeight > maxDimension) {
            const scale = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
            targetWidth = Math.floor(targetWidth * scale);
            targetHeight = Math.floor(targetHeight * scale);
          }
          
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          
          // Store dimensions for submission
          setImageDimensions({ width: targetWidth, height: targetHeight });
          
          // Draw scaled/cropped image
          const sourceX = (img.width - (targetHeight * targetAspect)) / 2;
          const sourceY = (img.height - (targetWidth / targetAspect)) / 2;
          const sourceWidth = imgAspect > targetAspect ? targetHeight * targetAspect : img.width;
          const sourceHeight = imgAspect > targetAspect ? img.height : targetWidth / targetAspect;
          
          ctx.drawImage(
            img,
            Math.max(0, sourceX), Math.max(0, sourceY),
            sourceWidth, sourceHeight,
            0, 0,
            canvas.width, canvas.height
          );
          
          const composite = canvas.toDataURL('image/jpeg', 0.85);
          setCompositeImage(composite);
        };
        img.src = capturedImage;
      }
    }
  }, [capturedImage, compositeImageWithFrame, selectedFrame]);

  const handleFrameSelect = (frame: Frame) => {
    setSelectedFrame(frame);
    setStep('capture-photo');
  };

  // How users get the layout and the message (epic 444). The generated frame carries the editor's setting; without it the page keeps the random image at every shutter press.
  const selection = frames.length === 0 ? (generatedFrame?.selection ?? null) : null;
  // The same setting for an event with several complete frames of its own: only the design applies (a complete frame has no message).
  const ownLayout = useMemo(() => (frames.length > 1 ? (storedFrameSelection(event?.frameSelection)?.layout ?? null) : null), [event?.frameSelection, frames.length]);
  const layoutChoices = useMemo(() => (selection && generatedFrame ? layoutsToChoose(generatedFrame) : []), [selection, generatedFrame]);
  const messageChoices = useMemo(() => (selection && generatedFrame ? messagesToChoose(generatedFrame, choice) : []), [selection, generatedFrame, choice]);
  // Whether the page ever asks for a design or a message, for the step list: the message is asked whenever the user chooses it and the event has more than one.
  const asksLayout = layoutChoices.length > 0;
  const asksMessage = Boolean(selection && generatedFrame && selection.message.mode === 'user' && messagesToChoose(generatedFrame, { layoutId: null, messageIndex: null }).length > 0);

  // The image or frame of a photo is drawn when the camera step opens, so the live view and the move-and-zoom step show the dark area of the design that photo gets; a retake draws again.
  useEffect(() => {
    if (step !== 'capture-photo') return;
    if (selection && generatedFrame) {
      const variant = drawVariant(generatedFrame, choice, lastDrawKey.current);
      if (variant) {
        lastDrawKey.current = variantKeyOf(variant);
        setSelectedFrame(variantFrame(variant));
      }
    } else if (ownLayout && ownLayout.mode !== 'user') {
      const own = drawOwnFrame(frames, ownLayout, lastDrawKey.current);
      if (own) {
        lastDrawKey.current = own.frameId;
        setSelectedFrame(own);
      } else {
        setStep('select-frame');
      }
    }
  }, [step, selection, generatedFrame, choice, ownLayout, frames]);

  const handleLayoutSelect = (variant: CaptureVariant) => {
    if (!generatedFrame) return;
    const next = chooseLayout(generatedFrame, choice, layoutIdOf(variant));
    setChoice(next);
    setStep(nextStep(generatedFrame, next));
  };

  const handleMessageSelect = (variant: CaptureVariant) => {
    setChoice((current) => ({ ...current, messageIndex: variant.index }));
    setStep('capture-photo');
  };

  // The steps the user sees in the list at the top: the frame when there are several of the event's own and the user picks, the design and the message when the user chooses them.
  const asksFrame = frames.length > 1 && !(ownLayout && ownLayout.mode !== 'user');
  const progressSteps: Array<{ id: string; label: string; steps: Array<typeof step> }> = [
    ...(asksFrame ? [{ id: 'frame', label: t('flow.step.selectFrame'), steps: ['select-frame' as const] }] : []),
    ...(asksLayout ? [{ id: 'layout', label: t('flow.step.selectLayout'), steps: ['select-layout' as const] }] : []),
    ...(asksMessage ? [{ id: 'message', label: t('flow.step.selectMessage'), steps: ['select-message' as const] }] : []),
    { id: 'capture', label: t('flow.step.capture'), steps: ['capture-photo'] },
    { id: 'save', label: t('flow.step.save'), steps: ['reframe', 'preview'] },
  ];

  // Territories of the generated frame for the live view, taken from its first image (the layers are the same in all of them).
  // Under the editor's setting the design is drawn before the camera step opens, so the territories are those of that design.
  const liveTerritories = useMemo(
    () => selectedFrame?.generated?.territories ?? (generatedFrame && frames.length === 0 ? territoriesOf(generatedFrame.variants[0]) : undefined),
    [selectedFrame?.generated?.territories, generatedFrame, frames.length]
  );

  // Width over height of the frame the photo is cropped to (16:9 when the event has no frame).
  const captureAspect = selectedFrame
    ? frameIntrinsicAspect ??
      (selectedFrame.width > 0 && selectedFrame.height > 0 ? selectedFrame.width / selectedFrame.height : 16 / 9)
    : 16 / 9;

  // The camera records the whole image; the fan then moves and zooms it inside the frame in the
  // reframe step (camera#209), whose default is the largest crop that fills the frame.
  const handleCameraCapture = (capture: FullFrameCapture) => {
    // Without the editor's setting a random image is picked for this shutter press; with it the image was drawn when the camera step opened.
    if (generatedFrame && !selection) {
      const variant = pickVariant(generatedFrame, lastVariantIndex.current);
      if (variant) {
        lastVariantIndex.current = variant.index;
        setSelectedFrame(variantFrame(variant));
      }
    }
    setCapturedOriginal(capture);
    setStep('reframe');
  };

  // The frame-less crop continues through the composite step, as the old capture did, and the photo is saved as soon as its picture is made (camera#344).
  const handleReframeDone = (result: ReframeResult) => {
    setSaveRequested(true);
    setCapturedImage(result.dataUrl);
  };

  // The full photo is not kept: once the framed result is on screen it is dropped (it can be tens of megabytes).
  useEffect(() => {
    if (step === 'preview') setCapturedOriginal(null);
  }, [step]);

  const handleReframeRetake = () => {
    setCapturedOriginal(null);
    setStep('capture-photo');
  };

  const handleSave = async () => {
    if (!compositeImage || !event) return;

    clearCaptureNotices();
    setIsSaving(true);

    try {
      // Include userInfo and consents in the submission payload
      const submissionData: {
        imageData: string;
        frameId: string | null;
        eventId: string;
        eventName: string;
        partnerId: string | null;
        partnerName: string | null;
        imageWidth: number;
        imageHeight: number;
        requestTryOn?: boolean;
        leatherSuitId?: string | null;
        outfitBottomLeatherSuitId?: string | null;
        tryOnSourceImageData?: string | null;
        setupId?: string | null;
        cameraId?: string | null;
        userInfo?: WhoAreYouPageData;
        consents?: CollectedData['consents'];
        shareOptIn?: boolean;
        // The message and image of the generated default frame this photo used (camera#236).
        frameVariant?: { index: number | null; message: string | null; imageUrl: string };
      } = {
        imageData: compositeImage,
        frameId: selectedFrame?.generated ? null : selectedFrame?.frameId || null,  // Optional frame
        eventId: event.eventId,  // Use event UUID, not URL parameter
        eventName: event.name,
        partnerId: event.partnerId,
        partnerName: event.partnerName,
        imageWidth: imageDimensions?.width || selectedFrame?.width || 1920,
        imageHeight: imageDimensions?.height || selectedFrame?.height || 1080,
        cameraId,
        // The consent page covers showing the photo on the event's pledge wall; there is no separate choice any more (camera#344).
        shareOptIn: true,
        ...(selectedFrame?.generated
          ? {
              frameVariant: {
                index: selectedFrame.generated.index,
                message: selectedFrame.generated.message,
                imageUrl: selectedFrame.imageUrl,
              },
            }
          : {}),
      };

      if (selectedTryOnSuitId && event?.tryOn?.enabled) {
        submissionData.requestTryOn = true;
        submissionData.leatherSuitId = selectedTryOnSuitId;
        // A vetted photo is the source: the server keeps it and queues the try-on when the photo is approved.
        if (!vetted) submissionData.tryOnSourceImageData = capturedImage;
        if (selectedTryOnBottomSuitId && event?.tryOn?.outfitEnabled) {
          submissionData.outfitBottomLeatherSuitId = selectedTryOnBottomSuitId;
        }
      }
      
      // Add collected data from custom pages
      if (collectedData.userInfo) {
        submissionData.userInfo = collectedData.userInfo;
      }
      if (collectedData.consents.length > 0) {
        submissionData.consents = collectedData.consents;
      }
      
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Save failed:', response.status, errorData);
        throw new Error(errorData.error || t('flow.serverError', { status: response.status }));
      }

      const data = await response.json();
      const origin = window.location.origin;
      // Response is wrapped in { success: true, data: { submission: {...} } }
      const rawId = data.data?.submission?._id ?? data.submission?._id;
      const submissionId =
        typeof rawId === 'string' && rawId.trim()
          ? rawId.trim()
          : rawId != null
            ? String(rawId)
            : '';
      if (!submissionId) {
        throw new Error(t('flow.noSubmissionId'));
      }
      setSavedSubmissionId(submissionId);
      setHasFinalizedSubmissionEmail(false);
      // A photo of a vetted event is saved and waits for approval: no share link yet, the guest gets it by email.
      if ((data.data ?? data).pending === true) {
        setPendingApproval(true);
        setTryOnResult(null);
        setStep('preview');
        // The card on the preview step already says the photo waits (its title and its text), so the standard saved message is not shown on top of it: it ran into the card.
        // A saved message an editor wrote is their own choice and is still shown.
        if (pendingSavedMessageIsOwn) notifyCapture('success', pendingSavedMessage);
        return;
      }
      const emailNotice = buildEmailDeliveryNotice(data.data?.submission?.metadata, language);
      const finalSuccessMessage = emailNotice
        ? `${successMessage}\n${emailNotice}`
        : successMessage;
      setTryOnResult(data.data?.tryOn ?? data.tryOn ?? null);
      setShareUrl(`${origin}/share/${submissionId}`);
      setStep('preview');
      
      notifyCapture('success', finalSuccessMessage);
    } catch (error: unknown) {
      console.error('Error saving submission:', error);
      // The editor's own save-error text keeps its way (its ": Please try again." ending is dropped); the default is the dictionary's "Failed to save photo".
      const saveFailed = errorSaveMessage === t('flow.errorSave') ? t('flow.saveFailedPrefix') : errorSaveMessage.replace(': Please try again.', '');
      notifyCapture('error', `${saveFailed}: ${errorText(language, getErrorMessage(error, language))}`);
      // The user is still on the reframe screen: forget this picture so that Continue makes and saves it again.
      setCapturedImage(null);
      setCompositeImage(null);
    } finally {
      setIsSaving(false);
    }
  };

  // The photo is saved as soon as Continue has made its picture; nothing else is asked in between (camera#344).
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });
  useEffect(() => {
    if (!saveRequested || !compositeImage || isSaving) return;
    setSaveRequested(false);
    void handleSaveRef.current();
  }, [saveRequested, compositeImage, isSaving]);

  const updateSubmissionContact = async (submissionId: string, userInfo: WhoAreYouPageData) => {
    try {
      const response = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_user_info',
          userInfo,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('Could not persist guest contact on submission:', response.status, errorData);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Could not persist guest contact on submission:', error);
      return false;
    }
  };

  const finalizeSubmissionEmail = async (submissionId: string, userInfo?: WhoAreYouPageData | null) => {
    if (isFinalizingSubmission || hasFinalizedSubmissionEmail) {
      return false;
    }

    setIsFinalizingSubmission(true);
    try {
      const response = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finalize',
          ...(userInfo ? { userInfo } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('Could not finalize submission email dispatch:', response.status, errorData);
        return false;
      }

      setHasFinalizedSubmissionEmail(true);
      return true;
    } catch (error) {
      console.warn('Could not finalize submission email dispatch:', error);
      return false;
    } finally {
      setIsFinalizingSubmission(false);
    }
  };

  const finalizeSubmissionForEventEnd = () => {
    if (!savedSubmissionId || !shareUrl || hasFinalizedSubmissionEmail || isFinalizingSubmission) {
      return;
    }

    void finalizeSubmissionEmail(savedSubmissionId, collectedData.userInfo);
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      notifyCapture('success', linkCopiedMessage);
    } catch (error) {
      console.error('Error copying link:', error);
      notifyCapture('error', copyErrorMessage);
    }
  };

  const handleShareSocial = (platform: string) => {
    if (!shareUrl) {
      notifyCapture('warning', saveFirstMessage);
      return;
    }

    const text = shareCaptionForSocial;
    let url = '';

    switch (platform) {
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        break;
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'linkedin':
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        break;
      case 'whatsapp':
        url = `https://wa.me/?text=${encodeURIComponent(text + ' ' + shareUrl)}`;
        break;
    }

    if (url) {
      window.open(url, '_blank', 'width=600,height=400');
    }
  };

  // Custom page navigation handlers

  const enterCaptureStep = () => {
    if (selectedFrame) {
      setStep('capture-photo');
      return;
    }
    if (frames.length === 0) {
      setStep(nextStep(generatedFrame, choice));
      return;
    }
    setStep(ownLayout && ownLayout.mode !== 'user' ? 'capture-photo' : 'select-frame');
  };
  
  /**
   * Handle completion of Who Are You page
   * Stores user info and moves to next page
   */
  const handleWhoAreYouComplete = async (data: WhoAreYouPageData) => {
    setCollectedData(prev => ({
      ...prev,
      userInfo: data,
    }));

    // The contact of a vetted photo was given before the photo (the server needs it to email the link): nothing to update.
    if (savedSubmissionId && !vetted) {
      await updateSubmissionContact(savedSubmissionId, data);
    }

    handleNextPage();
  };
  
  /**
   * Handle completion of Accept/CTA pages
   * Stores consent and moves to next page
   */
  const handleConsentComplete = (page: CustomPage, data: AcceptPageData | CTAPageData) => {
    setCollectedData(prev => ({
      ...prev,
      consents: [
        ...prev.consents,
        // A consent page with several checkboxes leaves one record per checkbox: its exact text, its link and the time (camera#330).
        ...consentRecords({ pageId: page.pageId, pageType: page.pageType as 'accept' | 'cta', checkboxText: page.config.checkboxText }, data),
      ],
    }));
    handleNextPage();
  };
  
  /**
   * Navigate to next page in flow
   * Determines if moving to next custom page, capture, or thank you phase
   */
  const handleNextPage = () => {
    if (flowPhase === 'onboarding') {
      // In onboarding phase
      if (currentPageIndex + 1 < onboardingPages.length) {
        // More onboarding pages
        setCurrentPageIndex(currentPageIndex + 1);
      } else {
        // Move to capture phase
        setFlowPhase('capture');
        enterCaptureStep();
      }
    } else if (flowPhase === 'thankyou') {
      // In thank you phase
      if (currentPageIndex + 1 < thankYouPages.length) {
        // More thank you pages
        setCurrentPageIndex(currentPageIndex + 1);
      } else {
        // Completed all thank you pages - restart flow
        finalizeSubmissionForEventEnd();
        handleRestartFlow();
      }
    }
  };
  
  /**
   * Navigate to previous page
   */
  /**
   * Move from sharing to thank you pages
   * Called when user clicks NEXT button after saving
   */
  const handleMoveToThankYou = () => {
    if (hasAnyThankYouPages) {
      // Has thank you pages
      setFlowPhase('thankyou');
      setCurrentPageIndex(0);
    } else {
      // No thank you pages: the guest is ready for the next photo, already known (camera#285 owner default)
      finalizeSubmissionForEventEnd();
      handleNextPhoto();
    }
  };
  
  /**
   * Restart flow from beginning
   * Resets all state and goes back to first page or capture
   */
  /**
   * After a photo and its pages: straight to the camera for the next photo. The guest is already known (the login or email given at the
   * start and the consents accepted stay), so the next photo does not ask again; only an explicit "restart" page of the event starts over
   * from the first page (handleRestartFlow). The default of the guest journey; an event changes it with its own pages.
   */
  const handleNextPhoto = () => {
    setCapturedImage(null);
    setCapturedOriginal(null);
    setCompositeImage(null);
    setShareUrl(null);
    setPendingApproval(false);
    setImageDimensions(null);
    setTryOnResult(null);
    setSelectedTryOnSuitId(null);
    setSelectedTryOnBottomSuitId(null);
    setSavedSubmissionId(null);
    setHasFinalizedSubmissionEmail(false);
    setIsFinalizingSubmission(false);
    // A chosen frame is kept; a generated variant is picked again at the next shutter press.
    // Every photo asks again for the design and the message when the user chooses them; the image is drawn when the camera step opens.
    setSelectedFrame((current) => (current?.generated ? null : current));
    setChoice(NO_CHOICE);
    setFlowPhase('capture');
    setStep(frames.length > 1 && !selectedFrame ? (ownLayout && ownLayout.mode !== 'user' ? 'capture-photo' : 'select-frame') : nextStep(generatedFrame, NO_CHOICE));
  };

  const handleRestartFlow = () => {
    // Reset capture state
    setCapturedImage(null);
    setCapturedOriginal(null);
    setCompositeImage(null);
    setShareUrl(null);
    setPendingApproval(false);
    setImageDimensions(null);
    setTryOnResult(null);
    setSelectedTryOnSuitId(null);
    
    // CRITICAL: Auto-select frame if 0 or 1 frame available
    // PROHIBITED to show frame selector in these cases
    if (frames.length === 1) {
      setSelectedFrame(frames[0]);
    } else if (frames.length === 0) {
      setSelectedFrame(null);
    } else {
      // Multiple frames: reset selection, will show selector during flow
      setSelectedFrame(null);
    }

    setSavedSubmissionId(null);
    setHasFinalizedSubmissionEmail(false);
    setIsFinalizingSubmission(false);
    
    // Reset flow state
    setCollectedData({ consents: [] });
    
    // ALWAYS restart from the very beginning
    if (hasAnyOnboardingPages) {
      // Has onboarding pages - start from first onboarding page
      setFlowPhase('onboarding');
      setCurrentPageIndex(0);
    } else {
      // No onboarding - go straight to capture phase
      setFlowPhase('capture');
      enterCaptureStep();
    }
  };

  // Render custom pages for onboarding or thank-you phases
  if (!isLoading && event && (flowPhase === 'onboarding' || flowPhase === 'thankyou')) {
    const phasePages = flowPhase === 'onboarding' ? onboardingPages : thankYouPages;
    const currentPage = phasePages[currentPageIndex];
    
    if (!currentPage) {
      // No current page, move to appropriate phase
      if (flowPhase === 'onboarding') {
        setFlowPhase('capture');
      } else {
        // The last page of the journey is done: ready for the next photo, not back at the login (owner default)
        finalizeSubmissionForEventEnd();
        handleNextPhoto();
      }
      return null;
    }
    
    // Render page based on type
    switch (currentPage.pageType) {
      case 'who-are-you':
        return (
          <WhoAreYouPage
            config={{
              title: currentPage.config.title,
              description: currentPage.config.description,
              nameLabel: own(['login.nameLabelEditor', 'login.nameLabel'], currentPage.config.nameLabel),
              emailLabel: own(['login.emailLabelEditor', 'login.emailLabel'], currentPage.config.emailLabel),
              buttonText: currentPage.config.buttonText,
              namePlaceholder: currentPage.config.namePlaceholder,
              emailPlaceholder: currentPage.config.emailPlaceholder,
              enableSSOLogin: currentPage.config.enableSSOLogin,
              enablePseudoReg: currentPage.config.enablePseudoReg,
              ssoButtonText: currentPage.config.ssoButtonText,
              pseudoFormTitle: currentPage.config.pseudoFormTitle,
            }}
            logoUrl={onboardingLogoUrl}
            brandColor={event.brandColor}
            brandBorderColor={event.brandBorderColor}
            buttonSize={eventButtonSize}
            eventId={eventId}
            pageIndex={currentPageIndex}
            onNext={handleWhoAreYouComplete}
          />
        );
      
      case 'accept':
        return (
          <AcceptPage
            config={{
              title: currentPage.config.title,
              description: currentPage.config.description,
              checkboxText: currentPage.config.checkboxText || '',
              checkboxes: currentPage.config.checkboxes,
              buttonText: currentPage.config.buttonText,
            }}
            pageId={currentPage.pageId}
            logoUrl={onboardingLogoUrl}
            brandColor={event.brandColor}
            brandBorderColor={event.brandBorderColor}
            buttonSize={eventButtonSize}
            onNext={(data) => handleConsentComplete(currentPage, data)}
          />
        );

      case 'cta':
        return (
          <CTAPage
            config={{
              title: currentPage.config.title,
              description: currentPage.config.description,
              checkboxText: currentPage.config.checkboxText || '',
              buttonText: currentPage.config.buttonText,
              hasButton: currentPage.config.hasButton,
              visitButtonText: currentPage.config.visitButtonText,
              redirectingText: currentPage.config.redirectingText,
              backgroundImageUrl: currentPage.config.backgroundImageUrl,
              buttonColor: currentPage.config.buttonColor,
              buttonTextColor: currentPage.config.buttonTextColor,
              buttonBorderColor: currentPage.config.buttonBorderColor,
            }}
            pageId={currentPage.pageId}
            logoUrl={onboardingLogoUrl}
            brandColor={event.brandColor}
            brandBorderColor={event.brandBorderColor}
            buttonSize={eventButtonSize}
            submissionId={savedSubmissionId ?? undefined}
            onNext={(data) => handleConsentComplete(currentPage, data)}
          />
        );

      case 'welcome':
        return (
          <WelcomePage
            config={{
              title: currentPage.config.title,
              buttonText: currentPage.config.buttonText,
              backgroundImageUrl: currentPage.config.backgroundImageUrl,
              bottomImageUrl: currentPage.config.bottomImageUrl,
              cornerImageUrl: currentPage.config.cornerImageUrl,
              // A picture set on the page is the page's own and wins; otherwise the page follows the one drawn from the default slideshow.
              screenImageUrl: currentPage.config.screenImageUrl || event?.welcomeScreen?.url,
              screenImageAlt: currentPage.config.screenImageAlt,
              buttonColor: currentPage.config.buttonColor,
              buttonTextColor: currentPage.config.buttonTextColor,
              buttonBorderColor: currentPage.config.buttonBorderColor,
            }}
            onNext={handleNextPage}
          />
        );

      case 'restart':
        return (
          <RestartPage
            config={{
              title: currentPage.config.title,
              description: currentPage.config.description,
              buttonText: currentPage.config.buttonText,
              restartButtonText: currentPage.config.restartButtonText,
            }}
            logoUrl={onboardingLogoUrl}
            brandColor={event.brandColor}
            brandBorderColor={event.brandBorderColor}
            buttonSize={eventButtonSize}
            onRestart={() => {
              finalizeSubmissionForEventEnd();
              handleRestartFlow();
            }}
          />
        );
      
      default:
        // Unknown page type or 'take-photo' (shouldn't happen)
        if (flowPhase === 'onboarding') {
          setFlowPhase('capture');
        } else {
          finalizeSubmissionForEventEnd();
          handleRestartFlow();
        }
        return null;
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-transparent">
        <div className="text-center">
          {loadingLogoUrl ? (
            <div className="relative mx-auto mb-8 h-64 w-full max-w-md">
              <Image
                src={loadingLogoUrl}
                alt={t('common.eventLogo')}
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          ) : null}
          <p className=" text-2xl">{own('event.loading', event?.loadingText)}</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-transparent p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold  mb-2">
            {t('event.notFound.title')}
          </h2>
          <p className="">
            {t('event.notFound.text')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-safe-area fixed inset-0 flex flex-col landscape:flex-row bg-transparent">
      <AppShellLock />
      {tourEnabled ? (
        <>
          <TourOverlay controller={selectFrameTour} />
          <TourOverlay controller={photoTour} />
          <TourOverlay controller={previewTour} />
        </>
      ) : null}
      {signInError && (
        <div
          data-event-card
          className="flex-shrink-0 z-50 mx-3 mt-3 border px-3 py-2 text-sm shadow-md landscape:mx-2 landscape:mt-2"
          role="alert"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{t('flow.signin.title')}</p>
              <p className="mt-1">{signInError.message}</p>
              {signInError.code === 'session_expired' && (
                <p className="mt-1  ">
                  {t('flow.signin.hint')}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSignInError(null)}
              className="shrink-0 rounded px-2 py-0.5    dark:"
              aria-label={t('common.dismiss')}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Combined Header and Progress Steps - Hide after save */}
      {!shareUrl && (
        <div className="flex-shrink-0 px-4 py-3 landscape:w-auto landscape:h-full landscape:py-4 landscape:px-2">
          <div className="  rounded-lg shadow-md p-3 landscape:h-full landscape:flex landscape:flex-col landscape:justify-center landscape:writing-mode-vertical">
            {/* Event Info */}
            <div className="text-center mb-3 landscape:mb-6 landscape:[writing-mode:vertical-lr] landscape:rotate-180">
              {event.showLogo && event.logoUrl && (
                <div className="relative mx-auto mb-2 h-16 w-16">
                  <Image
                    src={event.logoUrl}
                    alt={t('common.eventLogo')}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
              )}
              {event.partnerName && (
                <p className="text-xs  ">
                  {event.partnerName}
                </p>
              )}
              <h1 className="text-base font-bold  ">
                {event.name}
              </h1>
              {tourEnabled && (step === 'select-frame' || step === 'capture-photo') && (
                <div className="mt-2 flex justify-center landscape:hidden">
                  <TourReplayButton
                    tourId={step === 'select-frame' ? 'capture:select-frame:v1' : 'capture:photo:v1'}
                    controller={step === 'select-frame' ? selectFrameTour : photoTour}
                    label={t('tour.show')}
                  />
                </div>
              )}
            </div>
            {/* Progress Steps - Hide in landscape for camera */}
            <div
              className={`flex items-center justify-center gap-2 landscape:flex-col landscape:gap-4 landscape:hidden ${
                step === 'preview' ? '[@media(max-height:640px)]:hidden' : ''
              }`}
            >
              {/* One dot for each step the user goes through: the frame, or the design and the message when the user chooses them, then the photo and the save */}
              {progressSteps.map((entry, position) => (
                <Fragment key={entry.id}>
                  {position > 0 && <div className="w-4 h-0.5  "></div>}
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      entry.steps.includes(step) ? ' ' : '   '
                    }`}>
                      {position + 1}
                    </div>
                    <p className={`text-[10px] font-medium text-center mt-1 ${
                      entry.steps.includes(step) ? ' ' : ' '
                    }`}>
                      {entry.label}
                    </p>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Scrollable */}
      <div
        className={`min-h-0 flex-1 px-4 pb-4 ${
          step === 'preview'
            ? 'overflow-hidden'
            : 'overflow-y-auto overflow-x-hidden landscape:overflow-x-auto landscape:overflow-y-hidden'
        }`}
      >
        {/* Step 1: Frame Selection - Fit to screen keeping aspect ratio */}
        {step === 'select-frame' && (
          <div className="h-full flex items-center justify-center p-4">
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-6xl"
              data-tour-id="capture-frame-grid"
            >
              {frames.map((frame) => (
                <div key={frame.frameId} className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => handleFrameSelect(frame)}
                    className="overflow-hidden rounded-lg border-2  transition-all "
                  >
                    <Image
                      src={frame.imageUrl}
                      alt={frame.name}
                      width={800}
                      height={800}
                      unoptimized
                      className="h-auto max-h-[60vh] w-full object-contain"
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 1b: the user chooses the design of the generated frame (epic 444), the message comes next */}
        {step === 'select-layout' && (
          <div className="h-full flex items-center justify-center p-4">
            <div className="w-full max-w-6xl">
              <h2 className="mb-4 text-center text-lg font-bold">{t('flow.selectLayout.title')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-tour-id="capture-layout-grid">
                {layoutChoices.map((variant) => {
                  // The design is shown with the message the user already chose when it carries it, else with its first message.
                  const shown = generatedFrame?.variants.find((other) => layoutIdOf(other) === layoutIdOf(variant) && other.index === choice.messageIndex) ?? variant;
                  return (
                    <button
                      key={layoutIdOf(variant)}
                      type="button"
                      onClick={() => handleLayoutSelect(variant)}
                      className="overflow-hidden rounded-lg border-2 transition-all"
                      data-layout-choice
                    >
                      <Image src={shown.imageUrl} alt="" width={800} height={450} unoptimized className="h-auto max-h-[40vh] w-full object-contain" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 1c: the user chooses the message among those the design offers (issue 329, epic 444) */}
        {step === 'select-message' && (
          <div className="h-full flex items-center justify-center p-4">
            <div className="w-full max-w-6xl">
              <h2 className="mb-4 text-center text-lg font-bold">{t('flow.selectMessage.title')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-tour-id="capture-message-grid">
                {messageChoices.map((variant) => (
                  <button
                    key={variant.index}
                    type="button"
                    onClick={() => handleMessageSelect(variant)}
                    className="overflow-hidden rounded-lg border-2 transition-all"
                    aria-label={variant.message ?? undefined}
                    data-message-choice
                  >
                    <Image src={variant.imageUrl} alt="" width={800} height={450} unoptimized className="h-auto max-h-[40vh] w-full object-contain" />
                    <span className="block p-2 text-sm font-semibold">{variant.message}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Photo Capture - Fullscreen */}
        {step === 'capture-photo' && (
          <div className="app-safe-area fixed inset-0 z-40 flex flex-col">
            {/* Change buttons: the frame when there are several of the event's own, the design and the message when the user chooses them */}
            {(asksLayout || messageChoices.length > 0 || asksFrame) && (
              <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 items-end">
                {asksLayout && (
                  <Button type="button" onClick={() => setStep('select-layout')} size={eventButtonSize} radius="md" variant="light" data-tour-id="capture-change-layout-button">
                    {t('flow.changeLayout')}
                  </Button>
                )}
                {messageChoices.length > 0 && (
                  <Button type="button" onClick={() => setStep('select-message')} size={eventButtonSize} radius="md" variant="light" data-tour-id="capture-change-message-button">
                    {t('flow.changeMessage')}
                  </Button>
                )}
                {asksFrame && (
                  <Button
                    type="button"
                    onClick={() => setStep('select-frame')}
                    size={eventButtonSize}
                    radius="md"
                    variant="light"
                    data-tour-id="capture-change-frame-button"
                  >
                    {changeButtonText}
                  </Button>
                )}
              </div>
            )}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              {captureMethod === 'system' ? (
                // Every touch device takes the photo with its own camera: the camera's full still, the same everywhere.
                <SystemCameraCapture
                  onCapture={handleCameraCapture}
                  promptTitle={cameraPromptTitle}
                  captureButtonColor={event?.brandColor || CAMERA_DEFAULT_BRAND_COLOR}
                  buttonSize={eventButtonSize}
                />
              ) : captureMethod ? (
                <CameraCapture
                  // A desktop webcam: the live view takes a real still where the browser can, else the video frame. The
                  // reframe step crops it to the frame and compositeImageWithFrame adds the overlay afterwards.
                  onCapture={handleCameraCapture}
                  frameWidth={selectedFrame?.width || generatedFrame?.width || 1920}
                  frameHeight={selectedFrame?.height || generatedFrame?.height || 1080}
                  previewAspectWidthOverHeight={captureAspect}
                  territories={liveTerritories}
                  captureButtonColor={event?.brandColor || CAMERA_DEFAULT_BRAND_COLOR}
                  captureButtonBorderColor={event?.brandBorderColor || CAMERA_DEFAULT_BRAND_BORDER_COLOR}
                  promptTitle={cameraPromptTitle}
                  promptDescription={cameraPromptDescription}
                  buttonSize={eventButtonSize}
                  stillCapture={captureMethod === 'still'}
                  autoStart
                />
              ) : null}
            </div>
          </div>
        )}

        {/* Step 2b: Reframe - move and zoom the whole camera image inside the frame */}
        {step === 'reframe' && capturedOriginal && (
          <div className="app-safe-area fixed inset-0 z-40 flex flex-col">
            <ReframeStep
              capture={capturedOriginal}
              frameAspect={captureAspect}
              // The generated frame shows as territories until the preview step; own frames as before. A vetted event
              // never shows the real frame: its own frame shows as a silhouette (camera#265).
              frameImageUrl={vetted ? silhouetteUrl : selectedFrame?.generated ? null : selectedFrame?.imageUrl ?? null}
              territories={selectedFrame?.generated?.territories}
              buttonSize={eventButtonSize}
              onDone={handleReframeDone}
              onRetake={handleReframeRetake}
              busy={saveRequested || isProcessing || isSaving}
            >
              {vetted && (
                <p className="text-center text-sm" data-pending-notice>
                  {pendingPreviewNotice}
                </p>
              )}
              {event?.tryOn?.enabled ? (
                <div className="rounded-2xl p-3 shadow-md">
                  <TryOnSuitSelector
                    selectedSuitId={selectedTryOnSuitId}
                    onChange={setSelectedTryOnSuitId}
                    disabled={isSaving}
                    eventMongoId={eventId}
                    outfitEnabled={event?.tryOn?.outfitEnabled === true}
                    selectedBottomSuitId={selectedTryOnBottomSuitId}
                    onBottomChange={setSelectedTryOnBottomSuitId}
                  />
                </div>
              ) : null}
            </ReframeStep>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && compositeImage && (
          <div className="h-full w-full py-2">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col items-center gap-3 landscape:flex-row landscape:gap-4">
              {/* The image takes the space the actions leave; it is never scrolled past (camera#222) */}
              <div className="relative min-h-[20dvh] w-full flex-1 landscape:h-full landscape:min-h-0 landscape:min-w-0">
                {vetted ? (
                  <PendingPhotoPreview
                    photoUrl={compositeImage}
                    aspect={imageDimensions ? imageDimensions.width / imageDimensions.height : captureAspect}
                    territories={selectedFrame?.generated?.territories}
                    silhouetteUrl={selectedFrame?.generated ? null : silhouetteUrl}
                    alt={t('flow.alt.territories')}
                  />
                ) : (
                  <Image
                    src={compositeImage}
                    alt={t('flow.alt.final')}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                )}
              </div>

              {pendingApproval && (
                <div className={PREVIEW_PANEL_CLASS}>
                  <ShareOverlay
                    title={pendingTitle}
                    shareCaption={shareCaptionForSocial}
                    buttonSize={eventButtonSize}
                    nextButtonText={shareNextButtonText}
                    completionMessage={pendingWaitingMessage}
                    onNext={handleMoveToThankYou}
                    showShareActions={false}
                    stageStatus="complete"
                    overlay={false}
                  />
                </div>
              )}

              {shareUrl && showSharePage && (
                <div className={PREVIEW_PANEL_CLASS}>
                  <ShareOverlay
                    shareUrl={shareUrl}
                    title={shareScreenTitle}
                    copyButtonText={shareCopyLinkButtonText}
                    viewPhotoButtonText={shareViewPhotoButtonText}
                    suggestedMessageLabel={shareSuggestedMessageLabel}
                    shareCaption={shareCaptionForSocial}
                    tryOnResult={tryOnResult}
                    buttonSize={eventButtonSize}
                    nextButtonText={shareNextButtonText}
                    onCopyLink={handleCopyLink}
                    onShareSocial={handleShareSocial}
                    onNext={handleMoveToThankYou}
                    overlay={false}
                  />
                  {tourEnabled ? (
                    <div className="mt-2 flex justify-center">
                      <TourReplayButton tourId="capture:preview:v1" controller={previewTour} label={t('tour.show')} />
                    </div>
                  ) : null}
                </div>
              )}

              {shareUrl && !showSharePage && (
                <div className={PREVIEW_PANEL_CLASS}>
                  <ShareOverlay
                    title={t('flow.saved')}
                    shareCaption={shareCaptionForSocial}
                    tryOnResult={tryOnResult}
                    buttonSize={eventButtonSize}
                    nextButtonText={shareNextButtonText}
                    completionMessage={skipShareMessage}
                    onNext={handleMoveToThankYou}
                    showShareActions={false}
                    overlay={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Processing: one card in the colours of the event over a veil in its page colour (components/capture/ProcessingOverlay.tsx) */}
      {(isProcessing || isSaving) && (
        <ProcessingOverlay
          message={isSaving ? t('flow.overlay.saving') : vetted ? t('flow.overlay.preparing') : t('flow.overlay.frame')}
          logoUrl={event?.showLogo && event?.logoUrl ? event.logoUrl : null}
          logoAlt={t('common.eventLogo')}
        />
      )}
    </div>
  );
}
