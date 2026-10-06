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
import {
  CAPTURE_FAILED_MESSAGE,
  CAPTURE_MAX_ATTEMPTS,
  CAPTURE_NOT_READY_MESSAGE,
  CAPTURE_RETRY_DELAY_MS,
  SHUTTER_READY_TIMEOUT_MS,
  SHUTTER_WARMUP_MS,
  isBrokenFrame,
  runBoundedAttempts,
  type AttemptOutcome,
} from '@/lib/camera/capture-policy';
import { sampleVideoLumaStats, waitForVideoFrame } from '@/lib/camera/video-frame';

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
  /** Camera facing when capture opens. Defaults to the front camera for everyone (owner decision 2026-10-06). */
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
  initialFacingMode = 'user',
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
  // The shutter unlocks after the first presented frame plus a short warm-up (see capture-policy.ts).
  const [isShutterReady, setIsShutterReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startRequestRef = useRef(0);
  const autoStartAttemptedRef = useRef(false);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const capturingRef = useRef(false);

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
    setIsShutterReady(false);
    setCaptureNotice(null);
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
    setIsShutterReady(false);
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
   * Draw the current video frame to the output canvas (object-cover into the target aspect,
   * mirrored for the front camera) and hand the JPEG to onCapture. Returns false when the
   * frame could not be drawn, so the caller retries. Output size and crop are unchanged here;
   * the full-frame capture is camera#208.
   */
  const drawAndEmitFrame = (video: HTMLVideoElement, canvas: HTMLCanvasElement): boolean => {
    const { width: frameTargetWidth, height: frameTargetHeight } = getCaptureOutputPixelSize();

    canvas.width = frameTargetWidth;
    canvas.height = frameTargetHeight;

    // Scale the FULL video to fill the canvas (object-cover) and centre it.
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const scaledWidth = video.videoWidth * scale;
    const scaledHeight = video.videoHeight * scale;
    const offsetX = (canvas.width - scaledWidth) / 2;
    const offsetY = (canvas.height - scaledHeight) / 2;

    const ctx = canvas.getContext('2d', {
      willReadFrequently: false,
      alpha: false, // Safari optimization: no alpha channel needed
    });
    if (!ctx) {
      return false;
    }

    // Safari fix: fill with a white background first
    ctx.fillStyle = CAMERA_STAGE_WHITE;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    try {
      // Front camera: flip horizontally to match the mirrored live view
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

      if (frameImage) {
        ctx.drawImage(frameImage, 0, 0, canvas.width, canvas.height);
      }
    } catch (err) {
      console.error('Error drawing video to canvas:', err);
      return false;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setCaptureNotice(CAPTURE_FAILED_MESSAGE);
        return;
      }

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setCapturedImage(dataUrl);

      // Pass captured image to parent
      onCapture(blob, dataUrl);

      // Stop camera after capture
      stopCamera();
    }, 'image/jpeg', 0.95);

    return true;
  };

  /**
   * Capture a photo from the video stream. The shutter is only enabled once a frame has been
   * presented and the camera has warmed up; each tap waits for a fresh frame, rejects a
   * near-black flat one (sampled brightness, see capture-policy.ts) and tries at most
   * CAPTURE_MAX_ATTEMPTS times before telling the user, instead of looping silently.
   */
  const capturePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || capturingRef.current || !isShutterReady) {
      return;
    }

    capturingRef.current = true;
    setIsCapturing(true);
    setCaptureNotice(null);

    try {
      const result = await runBoundedAttempts(
        async (): Promise<AttemptOutcome> => {
          if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
            return 'retry';
          }

          if (video.paused || video.ended) {
            try {
              await video.play();
            } catch (playError) {
              console.error('Failed to play video:', playError);
              return 'retry';
            }
          }

          await waitForVideoFrame(video);

          if (frameOverlay && !frameImage) {
            return 'retry';
          }

          const sampleCanvas = sampleCanvasRef.current ?? (sampleCanvasRef.current = document.createElement('canvas'));
          const stats = sampleVideoLumaStats(video, sampleCanvas);
          if (stats && isBrokenFrame(stats)) {
            console.warn('Camera returned a broken (near-black, flat) frame; retrying.', stats);
            return 'retry';
          }

          return drawAndEmitFrame(video, canvas) ? 'done' : 'retry';
        },
        { maxAttempts: CAPTURE_MAX_ATTEMPTS, delayMs: CAPTURE_RETRY_DELAY_MS }
      );

      if (!result.ok) {
        setCaptureNotice(CAPTURE_NOT_READY_MESSAGE);
      }
    } finally {
      capturingRef.current = false;
      setIsCapturing(false);
    }
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
    const timer = window.setTimeout(() => {
      void startCamera(facingMode);
    }, 0);
    return () => window.clearTimeout(timer);
    // startCamera is intentionally omitted: auto-start runs once per mount via autoStartAttemptedRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    let warmupTimer: ReturnType<typeof setTimeout> | null = null;
    let frameCallbackId: number | null = null;
    const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function';

    // WHAT: unlocks the shutter a short warm-up after the first presented frame.
    // WHY: right after the stream starts the camera is still settling exposure and focus,
    //     and an early tap captures a near-black frame (camera#206).
    const unlockShutterAfterWarmup = () => {
      if (cancelled || warmupTimer) return;
      warmupTimer = setTimeout(() => {
        if (!cancelled) setIsShutterReady(true);
      }, SHUTTER_WARMUP_MS);
    };

    // Never leave the shutter dead if no frame event ever arrives on some browser.
    const shutterTimeout = setTimeout(() => {
      if (!cancelled) setIsShutterReady(true);
    }, SHUTTER_READY_TIMEOUT_MS);

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
          if (!hasFrameCallback && video.readyState >= 2) {
            unlockShutterAfterWarmup();
          }
        }
      };

      if (hasFrameCallback) {
        frameCallbackId = video.requestVideoFrameCallback(() => unlockShutterAfterWarmup());
      }

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
      if (warmupTimer) {
        clearTimeout(warmupTimer);
      }
      clearTimeout(shutterTimeout);
      if (frameCallbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(frameCallbackId);
      }
      detachListeners?.();
      if (video.srcObject === stream) {
        video.pause();
        video.srcObject = null;
      }
    };
  }, [stream]);

  const useTripleBar = controlBar === 'bottom-triple';
  const tripleBarClassName = useTripleBar ? 'camera-triple-bar camera-triple-bar--inline' : 'camera-triple-bar';

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

            {/* Shutter warm-up and capture messages (announced, not colour-only) */}
            {stream && !isLoading && !isShutterReady && (
              <div className="absolute inset-x-0 top-2 z-20 text-center text-xs" role="status">
                Getting ready…
              </div>
            )}
            {captureNotice && (
              <div className="absolute inset-x-0 bottom-2 z-20 p-2 text-center text-xs" role="status">
                {captureNotice}
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

      {/* Triple bar: optional extra row, then Cancel | Take | Change camera */}
      {useTripleBar && !capturedImage && (tripleBarExtra != null || stream) ? (
        <div className={tripleBarClassName}>
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
                <Button
                  type="button"
                  size={buttonSize}
                  radius="md"
                  onClick={() => void capturePhoto()}
                  disabled={!isShutterReady || isCapturing}
                >
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
        <div className={tripleBarClassName}>
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
            onClick={() => void capturePhoto()}
            disabled={!isShutterReady || isCapturing}
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
