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


interface Frame {
  _id: string;
  name: string;
  description?: string;
  category: string;
  imageUrl: string;
  isActive: boolean;
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📸</div>
          <p className="text-gray-600 dark:text-gray-400">Loading frames...</p>
        </div>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🖼️</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No Frames Available</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            There are no frames available yet. Please check back later!
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              📸 Take a Photo
            </h1>
            <a
              href="/"
              className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              ← Back
            </a>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${step === 'select-frame' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'select-frame' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                1
              </div>
              <span className="font-medium">Select Frame</span>
            </div>
            <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700"></div>
            <div className={`flex items-center gap-2 ${step === 'capture-photo' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'capture-photo' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                2
              </div>
              <span className="font-medium">Capture Photo</span>
            </div>
            <div className="flex-1 h-px bg-gray-300 dark:bg-gray-700"></div>
            <div className={`flex items-center gap-2 ${step === 'preview' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                3
              </div>
              <span className="font-medium">Preview & Save</span>
            </div>
          </div>
        </div>

        {/* Step 1: Frame Selection */}
        {step === 'select-frame' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Choose a Frame
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {frames.map((frame) => (
                <button
                  key={frame._id}
                  onClick={() => handleFrameSelect(frame)}
                  className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2 border-gray-200 dark:border-gray-700 hover:border-blue-600 dark:hover:border-blue-500 transition-colors overflow-hidden"
                >
                  <div className="aspect-square relative bg-gray-100 dark:bg-gray-700">
                    <Image
                      src={frame.imageUrl}
                      alt={frame.name}
                      fill
                      className="object-contain p-4"
                      unoptimized
                    />
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{frame.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{frame.category}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Photo Capture */}
        {step === 'capture-photo' && selectedFrame && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Capture Your Photo
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Selected frame: <span className="font-medium">{selectedFrame.name}</span>
                </p>
              </div>
              <button
                onClick={() => setStep('select-frame')}
                className="px-4 py-2 text-blue-600 hover:text-blue-700 transition-colors"
              >
                Change Frame
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">Take Photo</h3>
                <CameraCapture onCapture={handlePhotoCapture} frameOverlay={selectedFrame.imageUrl} />
              </div>
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">Or Upload Image</h3>
                <FileUpload onUpload={handlePhotoCapture} />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && compositeImage && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Preview Your Photo
            </h2>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="max-w-2xl mx-auto">
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden mb-6">
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
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? '💾 Saving...' : '💾 Save & Share'}
                      </button>
                    ) : (
                      <div className="flex-1 px-6 py-3 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded-lg font-semibold text-center">
                        ✓ Saved!
                      </div>
                    )}
                    <button
                      onClick={handleDownload}
                      className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      💾 Download
                    </button>
                  </div>

                  {shareUrl && (
                    <div className="border-t pt-4">
                      <h3 className="font-medium text-gray-900 dark:text-white mb-3">Share Your Photo</h3>
                      <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            className="flex-1 px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                          <button
                            onClick={handleCopyLink}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                          >
                            📋 Copy
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <button
                            onClick={() => handleShareSocial('facebook')}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                          >
                            Facebook
                          </button>
                          <button
                            onClick={() => handleShareSocial('twitter')}
                            className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm"
                          >
                            Twitter
                          </button>
                          <button
                            onClick={() => handleShareSocial('linkedin')}
                            className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors text-sm"
                          >
                            LinkedIn
                          </button>
                          <button
                            onClick={() => handleShareSocial('whatsapp')}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                          >
                            WhatsApp
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleReset}
                    className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    📸 Take Another Photo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
              <div className="text-6xl mb-4 animate-pulse">✨</div>
              <p className="text-gray-900 dark:text-white font-medium">
                Applying frame...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
