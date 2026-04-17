/**
 * Photo Capture Page
 * 
 * Main page for capturing photos with frame overlays.
 * Users select a frame, take/upload photo, and save result.
 */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import CameraCapture from '@/components/camera/CameraCapture';
import FileUpload from '@/components/camera/FileUpload';
import { AppButton } from '@/components/ui/AppButton';
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

  // Composite image with frame when photo is captured
  useEffect(() => {
    if (capturedImage && selectedFrame) {
      compositeImageWithFrame();
    }
  }, [capturedImage, selectedFrame]);

  const compositeImageWithFrame = async () => {
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
  };

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
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save submission');
      }

      const data = await response.json();
      setSubmissionId(data.submission._id);
      
      // Generate share URL
      const origin = window.location.origin;
      setShareUrl(`${origin}/share/${data.submission._id}`);
      
      alert('Photo saved successfully! You can now share it.');
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

  const handleShareSocial = (platform: string) => {
    if (!shareUrl) {
      alert('Please save the photo first to get a shareable link.');
      return;
    }

    const text = 'Check out my photo created with Camera!';
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
    setStep('select-frame');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="text-center">
          <div className="text-6xl mb-4">📸</div>
          <p className="text-slate-300">Loading frames...</p>
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
          <p className="text-slate-300 mb-6">
            There are no frames available yet. Please check back later!
          </p>
          <a href="/" className="app-btn app-btn--primary app-btn--inline">
            Go Home
          </a>
        </div>
      </div>
    );
  }

  if (step === 'capture-photo' && selectedFrame) {
    const { width: frameW, height: frameH } = framePixelDimensions(selectedFrame);
    const previewAspect =
      frameIntrinsicAspect ?? (frameW > 0 && frameH > 0 ? frameW / frameH : 16 / 9);
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
        <div className="absolute right-4 top-4 z-50">
          <button
            type="button"
            onClick={() => setStep('select-frame')}
            className="rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-gray-900 shadow-lg"
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
          <aside className="shrink-0 border-t border-white/15 bg-black/70 p-4 md:flex md:w-80 md:flex-col md:border-l md:border-t-0">
            <h3 className="mb-3 text-sm font-semibold text-white/90">Or upload image</h3>
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
            <a href="/" className="app-canvas-back">
              ← Back
            </a>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${step === 'select-frame' ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'select-frame' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-600 text-slate-300'}`}>
                1
              </div>
              <span className="font-medium">Select Frame</span>
            </div>
            <div className="flex-1 h-px bg-slate-600"></div>
            <div className={`flex items-center gap-2 ${step === 'capture-photo' ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'capture-photo' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-600 text-slate-300'}`}>
                2
              </div>
              <span className="font-medium">Capture Photo</span>
            </div>
            <div className="flex-1 h-px bg-slate-600"></div>
            <div className={`flex items-center gap-2 ${step === 'preview' ? 'text-emerald-400' : 'text-slate-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'preview' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-600 text-slate-300'}`}>
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
                  <div className="flex flex-col sm:flex-row gap-4">
                    {!submissionId ? (
                      <AppButton
                        type="button"
                        variant="primary"
                        className="app-btn--inline min-w-0 flex-1"
                        onClick={handleSave}
                        disabled={isSaving}
                      >
                        {isSaving ? '💾 Saving...' : '💾 Save & Share'}
                      </AppButton>
                    ) : (
                      <div className="app-banner-success">✓ Saved!</div>
                    )}
                    <AppButton
                      type="button"
                      variant="secondary"
                      className="app-btn--inline min-w-0 flex-1"
                      onClick={handleDownload}
                    >
                      💾 Download
                    </AppButton>
                  </div>

                  {shareUrl && (
                    <div className="border-t border-[var(--app-panel-border)] pt-4">
                      <h3 className="app-surface-card-row-title mb-3">Share Your Photo</h3>
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            className="app-form-control flex-1 text-sm"
                          />
                          <AppButton type="button" variant="ghost" compact onClick={handleCopyLink}>
                            📋 Copy
                          </AppButton>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <AppButton
                            type="button"
                            variant="secondary"
                            compact
                            className="app-btn--inline w-full min-w-0"
                            onClick={() => handleShareSocial('facebook')}
                          >
                            Facebook
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="secondary"
                            compact
                            className="app-btn--inline w-full min-w-0"
                            onClick={() => handleShareSocial('twitter')}
                          >
                            Twitter
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="secondary"
                            compact
                            className="app-btn--inline w-full min-w-0"
                            onClick={() => handleShareSocial('linkedin')}
                          >
                            LinkedIn
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="secondary"
                            compact
                            className="app-btn--inline w-full min-w-0"
                            onClick={() => handleShareSocial('whatsapp')}
                          >
                            WhatsApp
                          </AppButton>
                        </div>
                      </div>
                    </div>
                  )}

                  <AppButton type="button" variant="neutral" className="app-btn--block" onClick={handleReset}>
                    📸 Take Another Photo
                  </AppButton>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
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
