/**
 * Camera Capture Component
 * 
 * Handles live camera capture using getUserMedia API.
 * Supports both mobile (iOS Safari, Android Chrome) and desktop webcams.
 * 
 * Features:
 * - Camera permission handling
 * - Front/back camera selection on mobile
 * - Photo capture with preview
 * - Error handling and user feedback
 * - Responsive design for all devices
 * 
 * Browser Support:
 * - iOS Safari 11+
 * - Android Chrome 53+
 * - Desktop Chrome, Firefox, Safari, Edge
 */

'use client';

import Image from 'next/image';
import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { Button } from '@mantine/core';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
  CAMERA_STAGE_WHITE,
} from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';

/** Supports hex (#rgb) or CSS `var(--token)` for branded capture UI. */
function capturePromptBackground(fill: string): string {
  const t = fill.trim();
  if (t.startsWith('var(')) {
    return `linear-gradient(to bottom right, color-mix(in srgb, ${t} 85%, var(--app-shell-bg-start)), color-mix(in srgb, ${t} 58%, var(--app-shell-bg-end)))`;
  }
  return `linear-gradient(to bottom right, ${t}dd, ${t}aa)`;
}

export interface CameraCaptureProps {
  onCapture: (blob: Blob, dataUrl: string) => void;
  onError?: (error: Error) => void;
  className?: string;
  frameOverlay?: string; // URL of frame image to overlay
  frameWidth?: number;   // Frame width in pixels (for aspect ratio)
  frameHeight?: number;  // Frame height in pixels (for aspect ratio)
  captureButtonColor?: string; // Hex or CSS `var(--token)` for capture button fill (default brand token)
  captureButtonBorderColor?: string; // Hex or CSS `var(--token)` for capture button border
  promptTitle?: string;  // Custom title for camera start prompt
  promptDescription?: string; // Custom description for camera start prompt
  /** Default camera facing when capture opens. */
  initialFacingMode?: 'user' | 'environment';
  /**
   * When set (e.g. `9/16`), drives preview sizing, getUserMedia aspect, and capture output
   * even if `frameWidth`/`frameHeight` from the DB are wrong (e.g. legacy 1920×1080 defaults).
   */
  previewAspectWidthOverHeight?: number;
  /**
   * Bottom triple bar: Cancel (left), Take (center), Change camera (right) using GDS buttons.
   * When set, ignores orientation-based floating capture/switch positions.
   */
  controlBar?: 'default' | 'bottom-triple';
  /** Used with `controlBar="bottom-triple"` for the left Cancel action. */
  onCancel?: () => void;
  /**
   * Optional row above Cancel / Take / Change camera in the bottom triple bar.
   * Shown whenever the triple bar wrapper is visible before a captured still is held locally.
   */
  tripleBarExtra?: ReactNode;
  /**
   * After capture, show “Retake” in the triple bar (default true). Set false when a single shot should upload immediately without retake.
   */
  showRetake?: boolean;
  /** Event-level GDS button size for text controls. */
  buttonSize?: EventButtonSize;
  /** Start getUserMedia as soon as the camera step mounts. Falls back to the manual prompt if blocked. */
  autoStart?: boolean;
}

export default function CameraCapture({ 
  onCapture, 
  onError, 
  className = '', 
  frameOverlay, 
  frameWidth, 
  frameHeight,
  captureButtonColor = CAMERA_DEFAULT_BRAND_COLOR,
  captureButtonBorderColor = CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  promptTitle = 'Ready to capture?',
  promptDescription = 'Click to start your camera and take a photo',
  initialFacingMode = 'environment',
  previewAspectWidthOverHeight,
  controlBar = 'default',
  onCancel,
  tripleBarExtra,
  showRetake = true,
  buttonSize = DEFAULT_EVENT_BUTTON_SIZE,
  autoStart = false,
}: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(autoStart);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(initialFacingMode);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [frameImage, setFrameImage] = useState<HTMLImageElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [orientation, setOrientation] = useState<'portrait' | 'landscape-left' | 'landscape-right'>('portrait');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startRequestRef = useRef(0);
  const autoStartAttemptedRef = useRef(false);

  const isMobileDevice = useCallback(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }

    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
  }, []);

  const getTargetAspectRatio = useCallback(() => {
    if (
      previewAspectWidthOverHeight != null &&
      Number.isFinite(previewAspectWidthOverHeight) &&
      previewAspectWidthOverHeight > 0
    ) {
      return previewAspectWidthOverHeight;
    }

    if (frameWidth && frameHeight && frameWidth > 0 && frameHeight > 0) {
      return frameWidth / frameHeight;
    }

    if (frameImage && frameImage.width > 0 && frameImage.height > 0) {
      return frameImage.width / frameImage.height;
    }

    return 16 / 9;
  }, [frameHeight, frameImage, frameWidth, previewAspectWidthOverHeight]);

  const getCaptureOutputPixelSize = () => {
    const forced = previewAspectWidthOverHeight;
    const fromFrameW = frameWidth && frameWidth > 0 ? frameWidth : 0;
    const fromFrameH = frameHeight && frameHeight > 0 ? frameHeight : 0;
    const fromImgW = frameImage && frameImage.width > 0 ? frameImage.width : 0;
    const fromImgH = frameImage && frameImage.height > 0 ? frameImage.height : 0;

    if (forced != null && Number.isFinite(forced) && forced > 0) {
      let w = fromFrameW || fromImgW || 1080;
      let h = fromFrameH || fromImgH || 1920;
      const r = w / h;
      if (Math.abs(r - forced) > 0.02) {
        if (forced < 1) {
          h = Math.max(h, w > 0 ? Math.round(w / forced) : 1920, 1920);
          w = Math.round(h * forced);
        } else {
          w = Math.max(w, 1920);
          h = Math.round(w / forced);
        }
      }
      return { width: w, height: h };
    }

    return {
      width: fromFrameW || fromImgW || 1920,
      height: fromFrameH || fromImgH || 1080,
    };
  };

  /**
   * Load frame overlay image
   */
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    if (frameOverlay) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setFrameImage(img);
      img.onerror = (err) => console.error('Failed to load frame overlay:', err);
      img.src = frameOverlay;
    } else {
      queueMicrotask(() => {
        setFrameImage(null);
      });
    }
  }, [frameOverlay]);

  /**
   * Detect device orientation angle for precise control positioning.
   * Distinguishes left rotation (90°) from right rotation (270°).
   */
  useEffect(() => {
    const handleOrientation = () => {
      // Try Screen Orientation API first (modern browsers)
      if (typeof window !== 'undefined' && window.screen?.orientation) {
        const angle = window.screen.orientation.angle;
        if (angle === 0 || angle === 180) {
          setOrientation('portrait');
        } else if (angle === 90) {
          setOrientation('landscape-right'); // Device rotated left, controls go right
        } else if (angle === 270) {
          setOrientation('landscape-left'); // Device rotated right, controls go left
        }
      } else {
        // Fallback: use window dimensions (portrait vs landscape only)
        const isLandscape = window.innerWidth > window.innerHeight;
        setOrientation(isLandscape ? 'landscape-right' : 'portrait');
      }
    };
    
    handleOrientation();
    
    // Listen for orientation changes
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientation);
    }
    window.addEventListener('resize', handleOrientation);
    
    return () => {
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientation);
      }
      window.removeEventListener('resize', handleOrientation);
    };
  }, []);

  /**
   * Check if device has multiple cameras
   * Used to show camera switch button
   */
  useEffect(() => {
    const checkCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        // Always show camera selector if more than 1 camera available
        setHasMultipleCameras(videoDevices.length > 1);
      } catch (err) {
        console.error('Error checking cameras:', err);
      }
    };

    checkCameras();
  }, []);

  /**
   * Re-check cameras when stream changes
   */
  useEffect(() => {
    if (stream) {
      const checkCameras = async () => {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          setHasMultipleCameras(videoDevices.length > 1);
        } catch (err) {
          console.error('Error checking cameras:', err);
        }
      };
      checkCameras();
    }
  }, [stream]);

  /**
   * Start camera stream with specified constraints
   */
  const startCamera = async (facing: 'user' | 'environment' = facingMode) => {
    const requestId = ++startRequestRef.current;
    setIsLoading(true);
    setError(null);
    setCapturedImage(null);
    try {
      const currentStream = streamRef.current;
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStream(null);
      }

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }

      // Request camera access with the highest practical resolution
      // For mobile: use facingMode to select front/back camera
      // For desktop: use default camera
      const targetAspect = getTargetAspectRatio();
      const isLandscapeTarget = targetAspect >= 1;

      const mobile = isMobileDevice();

      const preferredVideoConstraints: MediaTrackConstraints = mobile
        ? {
            facingMode: { ideal: facing },
            width: { ideal: isLandscapeTarget ? 3840 : 2160 },
            height: { ideal: isLandscapeTarget ? 2160 : 3840 },
            aspectRatio: { ideal: targetAspect },
          }
        : {
            width: { ideal: isLandscapeTarget ? 2560 : 1440 },
            height: { ideal: isLandscapeTarget ? 1440 : 2560 },
            aspectRatio: { ideal: targetAspect },
          };

      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: preferredVideoConstraints,
          audio: false,
        });
      } catch (primaryError) {
        console.warn('Primary camera constraints failed, retrying with relaxed constraints.', primaryError);
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: mobile ? { facingMode: facing } : true,
          audio: false,
        });
      }

      if (requestId !== startRequestRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      
      setFacingMode(facing);
      setStream(mediaStream);
      
    } catch (err) {
      if (requestId !== startRequestRef.current) {
        return;
      }
      setIsLoading(false);
      
      const error = err as Error;
      let errorMessage = 'Failed to access camera';

      // Provide user-friendly error messages
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Camera access denied. Please allow camera permission in your browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = 'Camera is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = 'Camera does not support the requested settings.';
      }

      setError(errorMessage);
      
      if (onError) {
        onError(new Error(errorMessage));
      }

      console.error('Camera error:', error);
    }
  };

  /**
   * Stop camera stream and release resources
   */
  const stopCamera = useCallback(() => {
    startRequestRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
  }, []);

  /**
   * Switch between front and back camera (mobile)
   */
  const switchCamera = () => {
    if (isLoading) {
      return;
    }
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    void startCamera(newFacing);
  };

  /**
   * Capture a photo from the video stream.
   * The output matches the live view and crops to the target aspect ratio.
   */
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Safari fix: Comprehensive checks before capture
    // 1. Check if video has valid dimensions
    if (!video.videoWidth || !video.videoHeight) {
      console.warn('Video dimensions not ready, waiting...');
      setTimeout(() => capturePhoto(), 100);
      return;
    }
    
    // 2. Check if video is actually playing (Safari specific)
    if (video.paused || video.ended) {
      console.warn('Video not playing, attempting to play...');
      video.play().then(() => {
        setTimeout(() => capturePhoto(), 100);
      }).catch(err => {
        console.error('Failed to play video:', err);
        setError('Video playback failed. Please try again.');
      });
      return;
    }
    
    // 3. Check if video currentTime is progressing (actually rendering frames)
    if (video.currentTime === 0) {
      console.warn('Video not rendering frames yet, waiting...');
      setTimeout(() => capturePhoto(), 100);
      return;
    }

    // Safari fix: Use requestAnimationFrame to capture during actual frame render
    // This ensures Safari has actually painted the video frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Double RAF ensures we're definitely on a rendered frame
        
        // Calculate target aspect ratio from frame (or default 16:9)
        // Draw the full sensor, scaled to the frame size
        // This shows maximum visible area, matching what CSS object-cover displays
        // Example: 3000x4000 sensor → 1500x1000 frame (3:2)
        //   - Draw full 3000x4000 scaled to 1500x2000 (matches width)
        //   - Canvas clips to 1500x1000, showing all 3 people
        
        const { width: frameTargetWidth, height: frameTargetHeight } = getCaptureOutputPixelSize();

        canvas.width = frameTargetWidth;
        canvas.height = frameTargetHeight;
        
        // Calculate how to scale and position the FULL video to fill canvas (object-cover)
        const scaleX = canvas.width / video.videoWidth;
        const scaleY = canvas.height / video.videoHeight;
        const scale = Math.max(scaleX, scaleY); // Scale to fill (largest dimension)
        
        const scaledWidth = video.videoWidth * scale;
        const scaledHeight = video.videoHeight * scale;
        
        // Center the scaled video
        const offsetX = (canvas.width - scaledWidth) / 2;
        const offsetY = (canvas.height - scaledHeight) / 2;

        // Get canvas context
        const ctx = canvas.getContext('2d', { 
          willReadFrequently: false,
          alpha: false // Safari optimization: no alpha channel needed
        });
        
        if (!ctx) {
          setError('Failed to get canvas context');
          return;
        }

        if (frameOverlay && !frameImage) {
          console.warn('Frame overlay not loaded yet; retrying capture.');
          setTimeout(() => capturePhoto(), 150);
          return;
        }

        // Safari fix: Fill with white background first
        ctx.fillStyle = CAMERA_STAGE_WHITE;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        try {
          // Draw FULL video scaled to fill canvas (object-cover behavior)
          // If front camera, flip horizontally to match mirror view
          if (facingMode === 'user') {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(
              video,
              0, 0, video.videoWidth, video.videoHeight,
              -offsetX - scaledWidth, offsetY, scaledWidth, scaledHeight
            );
            ctx.restore();
          } else {
            ctx.drawImage(
              video,
              0, 0, video.videoWidth, video.videoHeight,
              offsetX, offsetY, scaledWidth, scaledHeight
            );
          }
          
          // Verify something was actually drawn (not black)
          const imageData = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
          const [r, g, b] = imageData.data;
          
          if (r === 0 && g === 0 && b === 0) {
            console.warn('Captured black frame, retrying...');
            setTimeout(() => capturePhoto(), 100);
            return;
          }

          if (frameImage) {
            ctx.drawImage(frameImage, 0, 0, canvas.width, canvas.height);
          }

          // Convert canvas to blob and data URL
          canvas.toBlob((blob) => {
            if (!blob) {
              setError('Failed to capture photo');
              return;
            }

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            setCapturedImage(dataUrl);
            
            // Pass captured image to parent
            onCapture(blob, dataUrl);
            
            // Stop camera after capture
            stopCamera();
          }, 'image/jpeg', 0.95);
          
        } catch (err) {
          console.error('Error drawing video to canvas:', err);
          setError('Failed to capture photo. Please try again.');
        }
      });
    });
  };

  /**
   * Retake photo (restart camera)
   */
  const retake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  useEffect(() => {
    if (!autoStart || autoStartAttemptedRef.current) {
      return;
    }

    autoStartAttemptedRef.current = true;
    void startCamera(facingMode);
  }, [autoStart, facingMode]);

  /**
   * Calculate container size to match the target aspect ratio.
   * What you see is what you capture, with a 1:1 preview-to-output correspondence.
   */
  useEffect(() => {
    const calculateSize = () => {
      if (!containerRef.current) return;
      
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      
      const availableWidth = parent.clientWidth;
      const availableHeight = parent.clientHeight;

      // Calculate target aspect ratio (frame or default 16:9)
      const targetAspect = getTargetAspectRatio();

      if (availableWidth <= 0) {
        return;
      }

      let width: number;
      let height: number;

      // Parent often has no usable height until the preview lays out (flex column + h-full chain).
      // Size from width so portrait frames (e.g. 9:16) get a tall preview instead of falling back to 100%×100%.
      if (availableHeight <= 0) {
        width = availableWidth;
        height = width / targetAspect;
        setContainerSize({ width, height });
        return;
      }

      // Fit maximum size at target aspect ratio within available space
      const containerAspectRatio = availableWidth / availableHeight;

      if (containerAspectRatio > targetAspect) {
        height = availableHeight;
        width = height * targetAspect;
      } else {
        width = availableWidth;
        height = width / targetAspect;
      }

      setContainerSize({ width, height });
    };

    calculateSize();
    window.addEventListener('resize', calculateSize);
    window.addEventListener('orientationchange', calculateSize);

    const parentEl = containerRef.current?.parentElement;
    const resizeObserver =
      parentEl && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            calculateSize();
          })
        : null;
    if (resizeObserver && parentEl) {
      resizeObserver.observe(parentEl);
    }

    return () => {
      window.removeEventListener('resize', calculateSize);
      window.removeEventListener('orientationchange', calculateSize);
      resizeObserver?.disconnect();
    };
  }, [frameWidth, frameHeight, frameImage, previewAspectWidthOverHeight, getTargetAspectRatio]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) {
      return;
    }

    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const markPreviewReady = () => {
      if (cancelled) return;
      setIsLoading(false);
    };

    const attachAndPlay = async () => {
      video.srcObject = stream;
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.autoplay = true;

      const readyHandler = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          markPreviewReady();
        }
      };

      video.addEventListener('loadedmetadata', readyHandler);
      video.addEventListener('loadeddata', readyHandler);
      video.addEventListener('canplay', readyHandler);
      video.addEventListener('playing', readyHandler);

      fallbackTimer = setTimeout(() => {
        if (!cancelled) {
          // Some browsers start rendering late without firing the expected sequence.
          // Drop the loading veil so the preview can still appear.
          setIsLoading(false);
        }
      }, 3000);

      try {
        await video.play();
      } catch (playError) {
        console.warn('Initial video.play() failed, retrying after metadata.', playError);
      }

      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        markPreviewReady();
      }

      if (video.paused) {
        setTimeout(() => {
          void video.play().catch((playError) => {
            console.warn('Delayed video.play() retry failed.', playError);
          });
        }, 150);
      }

      return () => {
        video.removeEventListener('loadedmetadata', readyHandler);
        video.removeEventListener('loadeddata', readyHandler);
        video.removeEventListener('canplay', readyHandler);
        video.removeEventListener('playing', readyHandler);
      };
    };

    let detachListeners: (() => void) | undefined;
    void attachAndPlay().then((cleanup) => {
      detachListeners = cleanup;
    });

    return () => {
      cancelled = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      detachListeners?.();
      if (video.srcObject === stream) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [stream]);

  const useTripleBar = controlBar === 'bottom-triple';

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${useTripleBar ? 'flex min-h-0 flex-col' : 'flex items-center justify-center'} ${className}`}
    >
      <div
        className={
          useTripleBar
            ? 'flex min-h-0 w-full flex-1 flex-col items-center justify-center'
            : 'flex h-full w-full items-center justify-center'
        }
      >
      {/* Camera view with calculated dimensions to fit viewport */}
      <div 
        className="relative  overflow-hidden"
        style={{
          width: containerSize.width > 0 ? `${containerSize.width}px` : '100%',
          height: containerSize.height > 0 ? `${containerSize.height}px` : '100%',
        }}
      >
        {!capturedImage ? (
          <>
            {/* Live Video Stream - Cover the frame area, mirror if front camera */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
              }}
            />

            {/* Frame Overlay - Always on top, exact size match */}
            {frameImage && (
              <div className="absolute inset-0 pointer-events-none z-10">
                <Image
                  src={frameOverlay ?? ''}
                  alt="Frame overlay"
                  fill
                  unoptimized
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
              <div className="absolute inset-0  flex items-center justify-center z-30">
                <div className=" text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2  mx-auto mb-4"></div>
                  <p className="text-sm">Starting camera...</p>
                </div>
              </div>
            )}

            {/* Error Overlay */}
            {error && !stream && (
              <div className="absolute inset-0  flex items-center justify-center p-6 z-30">
                <div className=" text-center max-w-md">
                  <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-base md:text-lg font-semibold mb-2">Camera Error</p>
                  <p className="text-xs md:text-sm mb-4">{error}</p>
                  <Button
                    type="button"
                    variant="light"
                    size={buttonSize}
                    onClick={() => startCamera(facingMode)}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {/* Start Camera Prompt */}
            {!stream && !isLoading && !error && (
              <button
                onClick={() => startCamera(facingMode)}
                className="absolute inset-0 flex items-center justify-center p-3 md:p-4 w-full h-full cursor-pointer transition-all z-30"
                style={{
                  background: capturePromptBackground(captureButtonColor),
                }}
              >
                <div className=" text-center max-w-xs md:max-w-md">
                  <svg className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-base md:text-lg font-semibold mb-2">{promptTitle}</p>
                  <p className="text-xs ">
                    {promptDescription}
                  </p>
                </div>
              </button>
            )}
          </>
        ) : (
          <>
            {/* Captured Image Preview */}
            <Image
              src={capturedImage}
              alt="Captured photo"
              fill
              unoptimized
              className="w-full h-full object-cover"
            />
          </>
        )}
      </div>
      </div>

      {/* Fixed bottom triple bar: optional extra row, then Cancel | Take | Change camera */}
      {useTripleBar && !capturedImage && (tripleBarExtra != null || stream) ? (
        <div className="camera-triple-bar">
          {tripleBarExtra != null ? (
            <div className="camera-triple-bar-extra mb-3 flex justify-center">{tripleBarExtra}</div>
          ) : null}
          {stream ? (
            <div className="camera-triple-bar-inner">
              <div className="justify-self-start">
                {onCancel ? (
                  <Button type="button" variant="light" size={buttonSize} radius="md" onClick={onCancel}>
                    Cancel
                  </Button>
                ) : (
                  <span />
                )}
              </div>
              <div className="justify-self-center">
                <Button type="button" size={buttonSize} radius="md" onClick={() => capturePhoto()}>
                  Take
                </Button>
              </div>
              <div className="justify-self-end">
                {hasMultipleCameras ? (
                  <Button
                    type="button"
                    variant="light"
                    size={buttonSize}
                    radius="md"
                    onClick={() => switchCamera()}
                    disabled={isLoading}
                  >
                    Change camera
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {useTripleBar && capturedImage && (
        <div className="camera-triple-bar">
          <div className="camera-triple-bar-inner">
            <div className="justify-self-start">
              {onCancel ? (
                <Button type="button" variant="light" size={buttonSize} radius="md" onClick={onCancel}>
                  Cancel
                </Button>
              ) : (
                <span />
              )}
            </div>
            <div className="justify-self-center">
              {showRetake ? (
                <Button type="button" variant="light" size={buttonSize} radius="md" onClick={() => retake()}>
                  Retake
                </Button>
              ) : (
                <span />
              )}
            </div>
            <div />
          </div>
        </div>
      )}

      {/* Camera Controls - Outside frame, positioned based on orientation (default layout) */}
      {!useTripleBar && stream && !capturedImage && (
        <>
          <button
            onClick={capturePhoto}
            className={`fixed z-50 h-16 w-16 rounded-full  shadow-lg transition-all ${
              orientation === 'portrait'
                ? 'bottom-4 left-1/2 -translate-x-1/2'
                : orientation === 'landscape-right'
                  ? 'right-4 top-1/2 -translate-y-1/2'
                  : 'left-4 top-1/2 -translate-y-1/2'
            }`}
            style={{
              borderWidth: '4px',
              borderStyle: 'solid',
              borderColor: captureButtonBorderColor,
            }}
            aria-label="Capture photo"
          >
            <div className="h-full w-full rounded-full" style={{ backgroundColor: captureButtonColor }} />
          </button>

          {hasMultipleCameras && (
            <button
              type="button"
              onClick={switchCamera}
              className={`fixed z-50 flex h-12 w-12 items-center justify-center rounded-full  shadow-lg  ${
                orientation === 'portrait'
                  ? 'bottom-4 right-4'
                  : orientation === 'landscape-right'
                    ? 'bottom-4 right-4'
                    : 'bottom-4 left-4'
              }`}
              aria-label="Switch camera"
              disabled={isLoading}
            >
              <svg className="h-6 w-6 " fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
        </>
      )}

      {!useTripleBar && capturedImage && showRetake ? (
        <button
          type="button"
          onClick={retake}
          className={`fixed z-50 rounded-lg  px-6 py-3 font-semibold  shadow-lg transition-all  ${
            orientation === 'portrait'
              ? 'bottom-4 left-1/2 -translate-x-1/2'
              : orientation === 'landscape-right'
                ? 'right-4 top-1/2 -translate-y-1/2'
                : 'left-4 top-1/2 -translate-y-1/2'
          }`}
        >
          Retake Photo
        </button>
      ) : null}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
