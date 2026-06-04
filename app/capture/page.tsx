/**
 * Photo Capture Page
 * 
 * Main page for capturing photos with frame overlays.
 * Users select a frame, take/upload photo, and save result.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import CameraCapture from '@/components/camera/CameraCapture';
import FileUpload from '@/components/camera/FileUpload';
import ShareOverlay from '@/components/capture/ShareOverlay';
import TryOnSuitSelector from '@/components/tryon/TryOnSuitSelector';
import { Button } from '@mantine/core';
import { loadImageAspectRatio } from '@/lib/camera/frame-preview-aspect';


interface Frame {
  _id: string;
  name: string;
  description?: string;
  category: string;
  imageUrl: string;
  isActive: boolean;
  /** From DB `frames` collection — drives CameraCapture aspect (same as event capture). */
  width?: number;
  height?: number;
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
}

function buildEmailDeliveryNotice(metadata?: SubmissionEmailMetadata | null): string {
  if (!metadata) {
    return '';
  }
  if (metadata.emailSent) {
    return `Confirmation email was sent to ${metadata.emailRecipient || 'the provided address'}.`;
  }
  if (metadata.emailSkipReason === 'event_email_disabled') {
    return 'Email module is disabled.';
  }
  if (metadata.emailSkipReason === 'missing_recipient') {
    return 'Email was not sent because no email address was provided.';
  }
  if (metadata.emailSkipReason === 'missing_api_key') {
    return 'Email was not sent because RESEND API key is not configured.';
  }
  if (metadata.emailSkipReason === 'missing_from_address') {
    return 'Email was not sent because sender domain is not configured.';
  }
  if (metadata.emailFailedAt && metadata.emailError) {
    return `Email failed: ${metadata.emailError}`;
  }
  return '';
}

function framePixelDimensions(frame: Frame): { width: number; height: number } {
  const w = Number(frame.width);
  const h = Number(frame.height);
  if (w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return { width: 1920, height: 1080 };
}

export default function CapturePage() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [compositeImage, setCompositeImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [step, setStep] = useState<'select-frame' | 'capture-photo' | 'preview'>('select-frame');
  const [frameIntrinsicAspect, setFrameIntrinsicAspect] = useState<number | null>(null);
  const [selectedTryOnSuitId, setSelectedTryOnSuitId] = useState<string | null>(null);
  const [tryOnResult, setTryOnResult] = useState<TryOnSubmissionResult | null>(null);

  // Fetch active frames
  useEffect(() => {
    async function fetchFrames() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch('/api/frames?active=true', {
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setFrames(data.frames || []);
      } catch (error) {
        console.error('Error fetching frames:', error);
        // Set empty array so we show "no frames" message instead of loading forever
        setFrames([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchFrames();
  }, []);

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
  }, [selectedFrame?._id, selectedFrame?.imageUrl]);

  const compositeImageWithFrame = useCallback(async () => {
    if (!capturedImage || !selectedFrame) return;

    setIsProcessing(true);

    try {
      // Load frame first to get its dimensions
      const frameImg = new window.Image();
      frameImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        frameImg.onload = resolve;
        frameImg.onerror = reject;
        frameImg.src = selectedFrame.imageUrl;
      });

      // Create canvas using FRAME dimensions (not photo dimensions)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      // Set canvas size to FRAME size
      canvas.width = frameImg.width;
      canvas.height = frameImg.height;

      // Load captured photo
      const photoImg = new window.Image();
      photoImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        photoImg.onload = resolve;
        photoImg.onerror = reject;
        photoImg.src = capturedImage;
      });

      // Calculate photo scaling to cover frame (object-fit: cover behavior)
      const frameAspect = canvas.width / canvas.height;
      const photoAspect = photoImg.width / photoImg.height;
      
      let drawWidth, drawHeight, offsetX, offsetY;
      
      if (photoAspect > frameAspect) {
        // Photo is wider - fit to height and crop sides
        drawHeight = canvas.height;
        drawWidth = photoImg.width * (canvas.height / photoImg.height);
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Photo is taller - fit to width and crop top/bottom
        drawWidth = canvas.width;
        drawHeight = photoImg.height * (canvas.width / photoImg.width);
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
      }

      // Draw photo (scaled and centered to cover frame area)
      ctx.drawImage(photoImg, offsetX, offsetY, drawWidth, drawHeight);

      // Draw frame on top at its native size
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

      // Convert to data URL
      const composite = canvas.toDataURL('image/png', 0.95);
      setCompositeImage(composite);
      setStep('preview');
    } catch (error) {
      console.error('Error compositing image:', error);
      alert('Failed to apply frame. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [capturedImage, selectedFrame]);

  // Composite image with frame when photo is captured
  useEffect(() => {
    if (capturedImage && selectedFrame) {
      void compositeImageWithFrame();
    }
  }, [capturedImage, compositeImageWithFrame, selectedFrame]);

  const handleFrameSelect = (frame: Frame) => {
    setSelectedFrame(frame);
    setStep('capture-photo');
  };

  const handlePhotoCapture = (blob: Blob, dataUrl: string) => {
    setCapturedImage(dataUrl);
  };

  const handleSave = async () => {
    if (!compositeImage || !selectedFrame) return;

    setIsSaving(true);

    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: compositeImage,
          frameId: selectedFrame._id,
          requestTryOn: Boolean(selectedTryOnSuitId),
          leatherSuitId: selectedTryOnSuitId,
          tryOnSourceImageData: selectedTryOnSuitId ? capturedImage : null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save submission');
      }

      const data = await response.json();
      const submission = data.data?.submission ?? data.submission;
      const rawId = submission?._id;
      const resolvedId =
        typeof rawId === 'string' && rawId.trim() ? rawId.trim() : rawId != null ? String(rawId) : '';
      if (!resolvedId) {
        throw new Error('Save succeeded but no submission id was returned');
      }

      setSubmissionId(resolvedId);
      setTryOnResult(data.data?.tryOn ?? data.tryOn ?? null);
      
      // Generate share URL
      const origin = window.location.origin;
      setShareUrl(`${origin}/share/${resolvedId}`);
      const emailNotice = buildEmailDeliveryNotice(submission?.metadata);
      const successMessage = emailNotice
        ? `Photo saved successfully! You can now share it.\n${emailNotice}`
        : 'Photo saved successfully! You can now share it.';

      alert(successMessage);
    } catch (error) {
      console.error('Error saving submission:', error);
      alert('Failed to save photo. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!compositeImage) return;

    const link = document.createElement('a');
    link.href = compositeImage;
    link.download = `camera-${Date.now()}.png`;
    link.click();
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    } catch (error) {
      console.error('Error copying link:', error);
      alert('Failed to copy link. Please copy it manually.');
    }
  };

  const shareCaptionForSocial = 'Check out my photo created with Camera!';

  const handleShareSocial = (platform: string) => {
    if (!shareUrl) {
      alert('Please save the photo first to get a shareable link.');
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
    setSelectedFrame(null);
    setCapturedImage(null);
    setCompositeImage(null);
    setSubmissionId(null);
    setShareUrl(null);
    setSelectedTryOnSuitId(null);
    setTryOnResult(null);
    setStep('select-frame');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="text-center">
          <div className="text-6xl mb-4">📸</div>
          <p className="">Loading frames...</p>
        </div>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🖼️</div>
          <h2 className="app-canvas-section-title">No Frames Available</h2>
          <p className=" mb-6">
            There are no frames available yet. Please check back later!
          </p>
          <Button component={Link} href="/" radius="xl">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'capture-photo' && selectedFrame) {
    const { width: frameW, height: frameH } = framePixelDimensions(selectedFrame);
    const previewAspect =
      frameIntrinsicAspect ?? (frameW > 0 && frameH > 0 ? frameW / frameH : 16 / 9);
    return (
      <div className="fixed inset-0 z-40 flex flex-col  ">
        <div className="absolute right-4 top-4 z-50">
          <button
            type="button"
            onClick={() => setStep('select-frame')}
            className="rounded-lg  px-3 py-2 text-sm font-medium  shadow-lg"
          >
            Change frame
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col pt-16 md:flex-row md:pt-4">
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-4">
            <CameraCapture
              onCapture={handlePhotoCapture}
              frameOverlay={undefined}
              frameWidth={frameW}
              frameHeight={frameH}
              previewAspectWidthOverHeight={previewAspect}
              promptTitle="Capture your photo"
              promptDescription="Fill the preview; your frame is composited after capture (same as event capture)."
            />
          </div>
          <aside className="shrink-0 border-t   p-4 md:flex md:w-80 md:flex-col md:border-l md:border-t-0">
            <h3 className="mb-3 text-sm font-semibold ">Or upload image</h3>
            <FileUpload onUpload={handlePhotoCapture} />
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="app-canvas-page-title">📸 Take a Photo</h1>
            <Link href="/" className="app-canvas-back">
              ← Back
            </Link>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${step === 'select-frame' ? '' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'select-frame' ? ' ' : ' '}`}>
                1
              </div>
              <span className="font-medium">Select Frame</span>
            </div>
            <div className="flex-1 h-px "></div>
            <div className={`flex items-center gap-2 ${step === 'capture-photo' ? '' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'capture-photo' ? ' ' : ' '}`}>
                2
              </div>
              <span className="font-medium">Capture Photo</span>
            </div>
            <div className="flex-1 h-px "></div>
            <div className={`flex items-center gap-2 ${step === 'preview' ? '' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'preview' ? ' ' : ' '}`}>
                3
              </div>
              <span className="font-medium">Preview & Save</span>
            </div>
          </div>
        </div>

        {/* Step 1: Frame Selection */}
        {step === 'select-frame' && (
          <div>
            <h2 className="app-canvas-section-title">Choose a Frame</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {frames.map((frame) => (
                <button
                  key={frame._id}
                  type="button"
                  onClick={() => handleFrameSelect(frame)}
                  className="app-surface-card-tile"
                >
                  <div className="aspect-square relative app-thumb-placeholder">
                    <Image
                      src={frame.imageUrl}
                      alt={frame.name}
                      fill
                      className="object-contain p-4"
                      unoptimized
                    />
                  </div>
                  <div className="app-surface-card-pad-sm">
                    <p className="app-surface-card-row-title">{frame.name}</p>
                    <p className="app-surface-meta capitalize">{frame.category}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Photo Capture — fullscreen UI (early return above when active) */}

        {/* Step 3: Preview */}
        {step === 'preview' && compositeImage && (
          <div>
            <h2 className="app-canvas-section-title">Preview Your Photo</h2>
            <div className="app-surface-panel">
              <div className="max-w-2xl mx-auto">
                <div className="relative aspect-square app-thumb-placeholder rounded-lg overflow-hidden mb-6">
                  <Image
                    src={compositeImage}
                    alt="Final result"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>

                <div className="space-y-4">
                  {!submissionId ? (
                    <div className="app-surface-card app-surface-card-pad-sm">
                      <p className="app-surface-card-row-title">Optional try-on</p>
                      <p className="app-surface-meta mt-1 mb-3">
                        Queue this capture for leather try-on after the image is saved.
                      </p>
                      <TryOnSuitSelector
                        selectedSuitId={selectedTryOnSuitId}
                        onChange={setSelectedTryOnSuitId}
                        disabled={isSaving}
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row gap-4">
                    {!submissionId ? (
                      <Button
                        type="button"
                        radius="xl"
                        fullWidth
                        onClick={handleSave}
                        disabled={isSaving}
                      >
                        {isSaving ? '💾 Saving...' : '💾 Save & Share'}
                      </Button>
                    ) : (
                      <div className="app-banner-success">✓ Saved!</div>
                    )}
                    <Button
                      type="button"
                      variant="light"
                      radius="xl"
                      fullWidth
                      onClick={handleDownload}
                    >
                      💾 Download
                    </Button>
                  </div>

                  {shareUrl && (
                    <div className="border-t  pt-4">
                      <ShareOverlay
                        shareUrl={shareUrl}
                        shareCaption={shareCaptionForSocial}
                        tryOnResult={tryOnResult}
                        title="Share Your Photo"
                        copyButtonText="Copy"
                        viewPhotoButtonText="View your photo (opens share link)"
                        suggestedMessageLabel="Suggested message:"
                        onCopyLink={handleCopyLink}
                        onShareSocial={handleShareSocial}
                        overlay={false}
                      />
                    </div>
                  )}

                  <Button type="button" variant="light" radius="xl" fullWidth onClick={handleReset}>
                    📸 Take Another Photo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center ">
            <div className="app-surface-card p-8 text-center">
              <div className="text-6xl mb-4 animate-pulse">✨</div>
              <p className="app-surface-card-row-title">Applying frame...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
