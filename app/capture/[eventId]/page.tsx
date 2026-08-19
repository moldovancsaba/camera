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

import { useState, useEffect, use, useCallback } from 'react';
import Image from 'next/image';
import { Button } from '@mantine/core';
import CameraCapture from '@/components/camera/CameraCapture';
import ShareOverlay from '@/components/capture/ShareOverlay';
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
import CTAPage, { type CTAPageData } from '@/components/capture/CTAPage';
import RestartPage from '@/components/capture/RestartPage';
import TryOnSuitSelector from '@/components/tryon/TryOnSuitSelector';
import { type CustomPage } from '@/lib/db/schemas';
import { loadImageAspectRatio } from '@/lib/camera/frame-preview-aspect';
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
  logoUrl?: string;  // Optional event logo URL
  showLogo: boolean;  // Whether to display logo on pages
  brandColor?: string;  // Primary brand color (hex)
  brandBorderColor?: string;  // Border/accent color (hex)
  visualSettings?: {
    buttonSize?: EventButtonSize;
  };
  frames?: EventFrameAssignment[];
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

interface EventFramesResponse {
  data?: {
    frames?: Frame[];
  };
}

// Collected data from custom pages
interface CollectedData {
  userInfo?: WhoAreYouPageData;
  consents: Array<{
    pageId: string;
    pageType: 'accept' | 'cta';
    checkboxText: string;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred';
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

function buildEmailDeliveryNotice(metadata?: SubmissionEmailMetadata | null): string {
  if (!metadata) {
    return '';
  }
  if (metadata.emailSent) {
    return `Confirmation email was sent to ${metadata.emailRecipient || 'the provided address'}.`;
  }
  if (metadata.emailSkipReason === 'event_email_disabled') {
    return 'Email module is disabled for this event.';
  }
  if (metadata.emailSkipReason === 'missing_recipient') {
    return 'Email will be sent once the event is completed and guest email is collected.';
  }
  if (metadata.emailSkipReason === 'missing_api_key') {
    return 'Email was not sent because RESEND API key is not configured.';
  }
  if (metadata.emailSkipReason === 'missing_from_address') {
    return 'Email was not sent because sender domain is not configured.';
  }
  if (metadata.emailSendAfterRelatedPending) {
    return 'Email is waiting for related photos to become ready.';
  }
  if (metadata.emailFailedAt && metadata.emailError) {
    return `Email failed: ${metadata.emailError}`;
  }
  return '';
}

export default function EventCapturePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  
  const [event, setEvent] = useState<EventData | null>(null);
  const [loadingLogoUrl, setLoadingLogoUrl] = useState<string | null>(null);
  const [onboardingLogoUrl, setOnboardingLogoUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [step, setStep] = useState<'select-frame' | 'capture-photo' | 'preview'>('select-frame');
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

  const captureButtonText = configuredTakePhotoPage?.config.captureButtonText || 'LOVE IT';
  const retryButtonText = configuredTakePhotoPage?.config.retryButtonText || 'TRY AGAIN';
  const shareNextButtonText = configuredTakePhotoPage?.config.shareNextButtonText || 'NEXT';
  const changeButtonText = configuredTakePhotoPage?.config.changeButtonText || 'Change';
  const successMessage = configuredTakePhotoPage?.config.successMessage || 'Photo saved successfully! You can now share it.';
  const showSharePage = configuredTakePhotoPage?.config.showSharePage !== false;
  const skipShareMessage = configuredTakePhotoPage?.config.skipShareMessage || 'Thank you! Your photo has been saved.';
  const cameraPromptTitle = configuredTakePhotoPage?.config.cameraPromptTitle || 'Ready to capture?';
  const cameraPromptDescription =
    configuredTakePhotoPage?.config.cameraPromptDescription || 'Click to start your camera and take a photo';
  const errorFrameMessage = configuredTakePhotoPage?.config.errorFrameMessage || 'Failed to apply frame. Please try again.';
  const errorSaveMessage = configuredTakePhotoPage?.config.errorSaveMessage || 'Failed to save photo: Please try again.';
  const linkCopiedMessage = configuredTakePhotoPage?.config.linkCopiedMessage || 'Link copied to clipboard!';
  const copyErrorMessage = configuredTakePhotoPage?.config.copyErrorMessage || 'Failed to copy link. Please copy it manually.';
  const saveFirstMessage = configuredTakePhotoPage?.config.saveFirstMessage || 'Please save the photo first to get a shareable link.';
  const shareScreenTitle =
    configuredTakePhotoPage?.config.shareScreenTitle?.trim() || 'Share Your Photo';
  const shareCopyLinkButtonText =
    configuredTakePhotoPage?.config.shareCopyLinkButtonText?.trim() || 'Copy';
  const shareViewPhotoButtonText =
    configuredTakePhotoPage?.config.shareViewPhotoButtonText?.trim() ||
    'View your photo (opens share link)';
  const shareSuggestedMessageLabel =
    configuredTakePhotoPage?.config.shareSuggestedMessageLabel?.trim() ||
    'Suggested message for apps below:';
  const shareSocialCaptionTemplateRaw =
    configuredTakePhotoPage?.config.shareSocialCaptionTemplate?.trim();
  const shareCaptionForSocial = shareSocialCaptionTemplateRaw
    ? shareSocialCaptionTemplateRaw.replace(
        /\{event\}/gi,
        () => event?.name?.trim() || ''
      )
    : event?.name?.trim()
      ? `Check out my photo from ${event.name.trim()}!`
      : 'Check out my photo!';
  const eventButtonSize = normalizeEventButtonSize(event?.visualSettings?.buttonSize);

  const selectFrameTour = useTourController('capture:select-frame:v1', getCaptureSelectFrameSteps(), {
    autoStart: step === 'select-frame',
  });
  const photoTour = useTourController(
    'capture:photo:v1',
    getCapturePhotoSteps({ hasMultipleFrames: frames.length > 1 }),
    { autoStart: step === 'capture-photo' }
  );
  const previewTour = useTourController('capture:preview:v1', getCapturePreviewSteps(), {
    autoStart: step === 'preview' && !!shareUrl && showSharePage,
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
        
      const response = await fetch(`/api/events/${eventId}`);
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
          logoUrl: eventData.logoUrl,
          showLogo: eventData.showLogo || false,
          brandColor: eventData.brandColor,
          brandBorderColor: eventData.brandBorderColor,
          visualSettings: {
            buttonSize: normalizeEventButtonSize(eventData.visualSettings?.buttonSize),
          },
          tryOn: eventData.tryOn,
        });
        
        // Fetch logos for loading-capture and onboarding-thankyou scenarios
        try {
          const logoResponse = await fetch(`/api/events/${eventId}/logos`);
          if (logoResponse.ok) {
            const logoData: EventLogosResponse = await logoResponse.json();
            
            // Loading logo
            const loadingLogos = logoData.data?.logos?.['loading-capture'] || logoData.logos?.['loading-capture'] || [];
            const activeLoadingLogo = loadingLogos.find((logo) => logo.isActive);
            if (activeLoadingLogo) {
              setLoadingLogoUrl(activeLoadingLogo.imageUrl);
            }
            
            // Onboarding/thank you logo
            const onboardingLogos = logoData.data?.logos?.['onboarding-thankyou'] || logoData.logos?.['onboarding-thankyou'] || [];
            const activeOnboardingLogo = onboardingLogos.find((logo) => logo.isActive);
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
        const activeFrameAssignments = (eventData.frames || []).filter((frame: EventFrameAssignment) => frame.isActive);
        const frameIds = activeFrameAssignments.map((frame: EventFrameAssignment) => frame.frameId);

        if (frameIds.length > 0) {
          // Fetch frame details
          const framesResponse = await fetch('/api/frames?active=true&limit=100');
          const framesData: EventFramesResponse = await framesResponse.json();
          
          // Filter to only frames assigned to this event (using frameId UUID)
          const eventFrames = (framesData.data?.frames || []).filter((frame) => 
            frameIds.includes(frame.frameId)
          );
          setFrames(eventFrames);
          
          // Auto-select if only one frame
          if (eventFrames.length === 1) {
            setSelectedFrame(eventFrames[0]);
            setStep('capture-photo');
          }
        } else {
          // No frames - skip to capture without frame
          setStep('capture-photo');
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
    if (!selectedFrame?.imageUrl) {
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
  }, [selectedFrame?.frameId, selectedFrame?.imageUrl]);

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
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

      const composite = canvas.toDataURL('image/jpeg', 0.85);
      setCompositeImage(composite);
      setStep('preview');
    } catch (error) {
      console.error('Error compositing image:', error);
      alert(errorFrameMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [capturedImage, errorFrameMessage, selectedFrame]);

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
            setStep('preview');
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
          setStep('preview');
        };
        img.src = capturedImage;
      }
    }
  }, [capturedImage, compositeImageWithFrame, selectedFrame]);

  const handleFrameSelect = (frame: Frame) => {
    setSelectedFrame(frame);
    setStep('capture-photo');
  };

  const handlePhotoCapture = (_blob: Blob, dataUrl: string) => {
    setCapturedImage(dataUrl);
  };

  const handleSave = async () => {
    if (!compositeImage || !event) return;

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
      } = {
        imageData: compositeImage,
        frameId: selectedFrame?.frameId || null,  // Optional frame
        eventId: event.eventId,  // Use event UUID, not URL parameter
        eventName: event.name,
        partnerId: event.partnerId,
        partnerName: event.partnerName,
        imageWidth: imageDimensions?.width || selectedFrame?.width || 1920,
        imageHeight: imageDimensions?.height || selectedFrame?.height || 1080,
        cameraId,
      };

      if (selectedTryOnSuitId && event?.tryOn?.enabled) {
        submissionData.requestTryOn = true;
        submissionData.leatherSuitId = selectedTryOnSuitId;
        submissionData.tryOnSourceImageData = capturedImage;
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
        throw new Error(errorData.error || `Server error: ${response.status}`);
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
        throw new Error('Save succeeded but no submission id was returned');
      }
      setSavedSubmissionId(submissionId);
      setHasFinalizedSubmissionEmail(false);
      const emailNotice = buildEmailDeliveryNotice(data.data?.submission?.metadata);
      const finalSuccessMessage = emailNotice
        ? `${successMessage}\n${emailNotice}`
        : successMessage;
      setTryOnResult(data.data?.tryOn ?? data.tryOn ?? null);
      setShareUrl(`${origin}/share/${submissionId}`);
      
      alert(finalSuccessMessage);
    } catch (error: unknown) {
      console.error('Error saving submission:', error);
      alert(`${errorSaveMessage.replace(': Please try again.', '')}: ${getErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

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
      alert(linkCopiedMessage);
    } catch (error) {
      console.error('Error copying link:', error);
      alert(copyErrorMessage);
    }
  };

  const handleShareSocial = (platform: string) => {
    if (!shareUrl) {
      alert(saveFirstMessage);
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

  const handleReset = () => {
    // Keep selected frame and go back to capture step
    setCapturedImage(null);
    setCompositeImage(null);
    setShareUrl(null);
    setTryOnResult(null);
    setSelectedTryOnSuitId(null);
    setStep('capture-photo');
    setSavedSubmissionId(null);
    setHasFinalizedSubmissionEmail(false);
  };
  
  // Custom page navigation handlers

  const enterCaptureStep = () => {
    if (selectedFrame) {
      setStep('capture-photo');
      return;
    }
    if (frames.length === 0) {
      setStep('capture-photo');
      return;
    }
    setStep('select-frame');
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

    if (savedSubmissionId) {
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
        {
          pageId: page.pageId,
          pageType: page.pageType as 'accept' | 'cta',
          checkboxText: page.config.checkboxText || '',
          accepted: data.accepted,
          acceptedAt: data.acceptedAt,
        },
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
      // No thank you pages, restart
      finalizeSubmissionForEventEnd();
      handleRestartFlow();
    }
  };
  
  /**
   * Restart flow from beginning
   * Resets all state and goes back to first page or capture
   */
  const handleRestartFlow = () => {
    // Reset capture state
    setCapturedImage(null);
    setCompositeImage(null);
    setShareUrl(null);
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
        finalizeSubmissionForEventEnd();
        handleRestartFlow();
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
              nameLabel: currentPage.config.nameLabel || 'Your Name',
              emailLabel: currentPage.config.emailLabel || 'Your Email',
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
            }}
            pageId={currentPage.pageId}
            logoUrl={onboardingLogoUrl}
            brandColor={event.brandColor}
            brandBorderColor={event.brandBorderColor}
            buttonSize={eventButtonSize}
            onNext={(data) => handleConsentComplete(currentPage, data)}
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
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="text-center">
          {loadingLogoUrl ? (
            <div className="relative mx-auto mb-8 h-64 w-full max-w-md">
              <Image
                src={loadingLogoUrl}
                alt="Event logo"
                fill
                unoptimized
                className="object-contain"
              />
            </div>
          ) : null}
          <p className=" text-2xl">{event?.loadingText || 'Loading event...'}</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold  mb-2">
            Event Not Found
          </h2>
          <p className="">
            This event could not be loaded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col landscape:flex-row bg-transparent">
      <TourOverlay controller={selectFrameTour} />
      <TourOverlay controller={photoTour} />
      <TourOverlay controller={previewTour} />
      {signInError && (
        <div
          className="flex-shrink-0 z-50 mx-3 mt-3 rounded-lg border   px-3 py-2 text-sm  shadow-md    landscape:mx-2 landscape:mt-2"
          role="alert"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Sign-in did not complete</p>
              <p className="mt-1">{signInError.message}</p>
              {signInError.code === 'session_expired' && (
                <p className="mt-1  ">
                  Use one browser tab for sign-in, or try again.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSignInError(null)}
              className="shrink-0 rounded px-2 py-0.5    dark:"
              aria-label="Dismiss"
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
                    alt="Event logo"
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
              {(step === 'select-frame' || step === 'capture-photo') && (
                <div className="mt-2 flex justify-center landscape:hidden">
                  <TourReplayButton
                    tourId={step === 'select-frame' ? 'capture:select-frame:v1' : 'capture:photo:v1'}
                    controller={step === 'select-frame' ? selectFrameTour : photoTour}
                    label="Show tour"
                  />
                </div>
              )}
            </div>
            {/* Progress Steps - Hide in landscape for camera */}
            <div className="flex items-center justify-center gap-2 landscape:flex-col landscape:gap-4 landscape:hidden">
              {/* Only show frame selection step if multiple frames */}
              {frames.length > 1 && (
                <>
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      step === 'select-frame' ? ' ' : '   '
                    }`}>
                      1
                    </div>
                    <p className={`text-[10px] font-medium text-center mt-1 ${
                      step === 'select-frame' ? ' ' : ' '
                    }`}>
                      Select Frame
                    </p>
                  </div>
                  <div className="w-4 h-0.5  "></div>
                </>
              )}
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  step === 'capture-photo' ? ' ' : '   '
                }`}>
                  {frames.length > 1 ? '2' : '1'}
                </div>
                <p className={`text-[10px] font-medium text-center mt-1 ${
                  step === 'capture-photo' ? ' ' : ' '
                }`}>
                  Capture Photo
                </p>
              </div>
              <div className="w-4 h-0.5  "></div>
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  step === 'preview' ? ' ' : '   '
                }`}>
                  {frames.length > 1 ? '3' : '2'}
                </div>
                <p className={`text-[10px] font-medium text-center mt-1 ${
                  step === 'preview' ? ' ' : ' '
                }`}>
                  Preview & Save
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 landscape:overflow-x-auto landscape:overflow-y-hidden">
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

        {/* Step 2: Photo Capture - Fullscreen */}
        {step === 'capture-photo' && (
          <div className="fixed inset-0  z-40 flex flex-col">
            {/* Minimal header with change frame button - only show if multiple frames */}
            {frames.length > 1 && (
              <div className="absolute top-4 right-4 z-50">
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
              </div>
            )}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0">
              <CameraCapture
                onCapture={handlePhotoCapture}
                // CRITICAL: No frame overlay during capture to prevent canvas issues
                // Frame will be composited AFTER capture in compositeImageWithFrame()
                frameOverlay={undefined}
                frameWidth={selectedFrame?.width || 1920}
                frameHeight={selectedFrame?.height || 1080}
                previewAspectWidthOverHeight={
                  selectedFrame
                    ? frameIntrinsicAspect ??
                      (selectedFrame.width > 0 && selectedFrame.height > 0
                        ? selectedFrame.width / selectedFrame.height
                        : 16 / 9)
                    : undefined
                }
                captureButtonColor={event?.brandColor || CAMERA_DEFAULT_BRAND_COLOR}
                captureButtonBorderColor={event?.brandBorderColor || CAMERA_DEFAULT_BRAND_BORDER_COLOR}
                promptTitle={cameraPromptTitle}
                promptDescription={cameraPromptDescription}
                buttonSize={eventButtonSize}
                autoStart
              />
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && compositeImage && (
          <div className="w-full py-4">
            <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4">
              {/* Image with no overlayed controls */}
              <div className="relative w-full">
                <Image
                  src={compositeImage}
                  alt="Final result"
                  width={selectedFrame?.width || 1200}
                  height={selectedFrame?.height || 1200}
                  unoptimized
                  className="w-full h-auto max-w-full object-contain"
                />
              </div>

              {!shareUrl && (
                <div className="flex w-full max-w-md flex-col gap-4 px-4">
                  {event?.tryOn?.enabled ? (
                    <div className="rounded-2xl p-4 shadow-2xl">
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
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    size={eventButtonSize}
                    radius="md"
                    fullWidth
                    color={event?.brandColor || CAMERA_DEFAULT_BRAND_COLOR}
                    className="shadow-2xl"
                  >
                    {isSaving ? (
                      event?.showLogo && event?.logoUrl ? (
                        <Image
                          src={event.logoUrl}
                          alt="Event logo"
                          width={32}
                          height={32}
                          unoptimized
                          className="animate-pulse object-contain"
                        />
                      ) : null
                    ) : null}
                    <span className="text-xl">{isSaving ? 'SAVING...' : captureButtonText}</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={handleReset}
                    size={eventButtonSize}
                    radius="md"
                    fullWidth
                    variant="light"
                    className="shadow-2xl"
                  >
                    <span className="text-xl">{retryButtonText}</span>
                  </Button>
                </div>
              )}

              {shareUrl && showSharePage && (
                <div className="w-full px-4 max-w-md">
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
                  />
                  <div className="mt-2 flex justify-center">
                    <TourReplayButton tourId="capture:preview:v1" controller={previewTour} label="Show tour" />
                  </div>
                </div>
              )}

              {shareUrl && !showSharePage && (
                <div className="w-full px-4 max-w-md">
                  <ShareOverlay
                    title="Saved"
                    shareCaption={shareCaptionForSocial}
                    tryOnResult={tryOnResult}
                    buttonSize={eventButtonSize}
                    nextButtonText={shareNextButtonText}
                    completionMessage={skipShareMessage}
                    onNext={handleMoveToThankYou}
                    showShareActions={false}
                  />
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0  flex items-center justify-center z-50">
          <div className="  rounded-lg p-8 text-center">
            {event?.showLogo && event?.logoUrl ? (
              <Image
                src={event.logoUrl}
                alt="Event logo"
                width={96}
                height={96}
                unoptimized
                className="mx-auto mb-4 animate-pulse object-contain"
              />
            ) : null}
            <p className="  font-medium">
              Applying frame...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
