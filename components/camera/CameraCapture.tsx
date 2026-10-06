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
import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Button } from '@mantine/core';
import {
  CAMERA_DEFAULT_BRAND_BORDER_COLOR,
  CAMERA_DEFAULT_BRAND_COLOR,
  CAMERA_STAGE_WHITE,
} from '@/lib/gds/tokens/colors';
import { DEFAULT_EVENT_BUTTON_SIZE, type EventButtonSize } from '@/lib/events/visual-settings';
import FrameTerritories from '@/components/capture/FrameTerritories';
import type { Territory } from '@/lib/frame/capture';
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
  type LumaStats,
} from '@/lib/camera/capture-policy';
import {
  buildVideoConstraintChain,
  detectTouchPrimaryDevice,
  isTerminalCameraError,
} from '@/lib/camera/constraints';
import { DIAGNOSTIC_VERSION, type CameraDiagnostic } from '@/lib/camera/diagnostics';
import {
  cameraTestLabel,
  newDiagnosticSession,
  pageDiagnosticFields,
  sendCameraDiagnostic,
} from '@/lib/camera/diagnostics-client';
import { captureFullFrame, type FullFrameCapture } from '@/lib/camera/frame-capture';
import { fillCropRect, toFractionRect } from '@/lib/camera/reframe';
import { sampleVideoLumaStats, waitForVideoFrame } from '@/lib/camera/video-frame';

/** Shown under the live view when the frame keeps only part of the camera image. */
const FRAME_GUIDE_HINT = 'Your frame keeps the bright area.';

/** Supports hex (#rgb) or CSS `var(--token)` for branded capture UI. */
function capturePromptBackground(fill: string): string {
  const t = fill.trim();
  if (t.startsWith('var(')) {
    return `linear-gradient(to bottom right, color-mix(in srgb, ${t} 85%, var(--app-shell-bg-start)), color-mix(in srgb, ${t} 58%, var(--app-shell-bg-end)))`;
  }
  return `linear-gradient(to bottom right, ${t}dd, ${t}aa)`;
}

export interface CameraCaptureProps {
  /**
   * Receives the whole camera image: not cropped, not framed, not mirrored (see FullFrameCapture).
   * The caller applies the frame's aspect ratio afterwards (lib/camera/frame-crop.ts).
   */
  onCapture: (capture: FullFrameCapture) => void;
  onError?: (error: Error) => void;
  className?: string;
  frameWidth?: number;   // Frame width in pixels (for aspect ratio)
  frameHeight?: number;  // Frame height in pixels (for aspect ratio)
  captureButtonColor?: string; // Hex or CSS `var(--token)` for capture button fill (default brand token)
  captureButtonBorderColor?: string; // Hex or CSS `var(--token)` for capture button border
  promptTitle?: string;  // Custom title for camera start prompt
  promptDescription?: string; // Custom description for camera start prompt
  /** Camera facing when capture opens. Defaults to the front camera for everyone (owner decision 2026-10-06). */
  initialFacingMode?: 'user' | 'environment';
  /**
   * When set (e.g. `9/16`), the frame's aspect ratio for the guide drawn over the live view,
   * even if `frameWidth`/`frameHeight` from the DB are wrong (e.g. legacy 1920×1080 defaults).
   * It no longer changes what is captured: the whole camera image is recorded.
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
  /** Layer boxes of the generated event frame, drawn inside the frame guide as 50% black territories (camera#236). */
  territories?: readonly Territory[];
}

export default function CameraCapture({ 
  onCapture, 
  onError, 
  className = '', 
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
  territories,
}: CameraCaptureProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(autoStart);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(initialFacingMode);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  // Width over height of the camera's own image, known once the video reports its size.
  const [cameraAspect, setCameraAspect] = useState<number | null>(null);
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
  const facingModeRef = useRef<'user' | 'environment'>(initialFacingMode);
  // WHAT: in-memory bookkeeping for the anonymous capture diagnostics (camera#204). Never persisted.
  const diagRef = useRef({
    session: '',
    requestedAt: 0,
    attachedAt: 0,
    firstFrameAt: 0,
    unlockedAt: 0,
    streamEventSent: false,
    requested: undefined as CameraDiagnostic['requested'],
    granted: undefined as CameraDiagnostic['granted'],
    deviceCount: undefined as number | undefined,
  });

  const reportDiagnostic = useCallback(
    (kind: CameraDiagnostic['kind'], fields: Partial<Omit<CameraDiagnostic, 'v' | 'kind' | 'session'>>) => {
      const diag = diagRef.current;
      if (!diag.session) diag.session = newDiagnosticSession();
      sendCameraDiagnostic({
        v: DIAGNOSTIC_VERSION,
        kind,
        session: diag.session,
        testRun: cameraTestLabel(),
        facingMode: facingModeRef.current,
        deviceCount: diag.deviceCount,
        page: pageDiagnosticFields(),
        ...fields,
      });
    },
    []
  );

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

    return 16 / 9;
  }, [frameHeight, frameWidth, previewAspectWidthOverHeight]);

  // The area the frame will keep, as fractions of the live view. Null while the camera's size is
  // unknown, or when the frame keeps the whole image (nothing to guide).
  const frameGuide = useMemo(() => {
    if (!cameraAspect) return null;
    const virtualHeight = 1000;
    const virtualWidth = Math.round(cameraAspect * virtualHeight);
    const rect = toFractionRect(
      fillCropRect(virtualWidth, virtualHeight, getTargetAspectRatio()),
      virtualWidth,
      virtualHeight
    );
    return rect.width > 0.995 && rect.height > 0.995 ? null : rect;
  }, [cameraAspect, getTargetAspectRatio]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // The camera's frame size can change while it runs: turning a phone changes it on iOS, with or without a resize event.
  // The stage follows the real size, otherwise a portrait picture sits in a landscape stage (or the other way round).
  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) return;
    const follow = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const next = video.videoWidth / video.videoHeight;
        setCameraAspect((current) => (current !== null && Math.abs(current - next) < 0.001 ? current : next));
      }
    };
    video.addEventListener('resize', follow);
    window.addEventListener('orientationchange', follow);
    window.addEventListener('resize', follow);
    const timer = window.setInterval(follow, 500);
    return () => {
      video.removeEventListener('resize', follow);
      window.removeEventListener('orientationchange', follow);
      window.removeEventListener('resize', follow);
      window.clearInterval(timer);
    };
  }, [stream, capturedImage]);

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
        diagRef.current.deviceCount = videoDevices.length;
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
          diagRef.current.deviceCount = videoDevices.length;
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
    facingModeRef.current = facing;
    diagRef.current.requestedAt = performance.now();
    diagRef.current.firstFrameAt = 0;
    diagRef.current.unlockedAt = 0;
    diagRef.current.streamEventSent = false;
    diagRef.current.granted = undefined;
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

      // Camera mode: a 4:3 mode on a ladder of looser fallbacks (lib/camera/constraints.ts).
      // facingMode is always an ideal, so no user-agent sniffing decides whether to send it,
      // and there is no aspectRatio constraint the browser could crop the frame for.
      const chain = buildVideoConstraintChain({
        facing,
        portrait: window.innerHeight >= window.innerWidth,
        touchPrimary: detectTouchPrimaryDevice(),
      });

      let mediaStream: MediaStream | null = null;
      let lastError: unknown = null;
      for (let step = 0; step < chain.length && !mediaStream; step += 1) {
        const attempt = chain[step];
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: attempt.constraints, audio: false });
          diagRef.current.requested =
            attempt.label === 'preferred'
              ? { mode: 'preferred', width: attempt.width, height: attempt.height }
              : { mode: 'relaxed' };
        } catch (cameraError) {
          lastError = cameraError;
          if (isTerminalCameraError(cameraError) || step === chain.length - 1) {
            break;
          }
          console.warn('Camera constraints failed, retrying with looser constraints.', cameraError);
        }
      }

      if (!mediaStream) {
        throw lastError ?? new Error('Failed to access camera');
      }

      if (requestId !== startRequestRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      
      const settings = mediaStream.getVideoTracks()[0]?.getSettings?.() as
        | (MediaTrackSettings & { resizeMode?: string })
        | undefined;
      diagRef.current.granted = settings
        ? {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            aspectRatio: settings.aspectRatio,
            facingMode: settings.facingMode,
            resizeMode: settings.resizeMode,
          }
        : undefined;

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
   * Capture a photo from the video stream. The shutter is only enabled once a frame has been
   * presented and the camera has warmed up; each tap waits for a fresh frame, rejects a
   * near-black flat one (sampled brightness, see capture-policy.ts) and tries at most
   * CAPTURE_MAX_ATTEMPTS times before telling the user, instead of looping silently.
   * The whole camera frame is recorded (camera#208); the frame's crop is applied afterwards.
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

    const tappedAt = performance.now();
    let brokenRetries = 0;
    let notReadyRetries = 0;
    let encodeFailures = 0;
    let lastStats: LumaStats | null = null;

    try {
      const result = await runBoundedAttempts(
        async (): Promise<AttemptOutcome> => {
          if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
            notReadyRetries += 1;
            return 'retry';
          }

          if (video.paused || video.ended) {
            try {
              await video.play();
            } catch (playError) {
              console.error('Failed to play video:', playError);
              notReadyRetries += 1;
              return 'retry';
            }
          }

          await waitForVideoFrame(video);

          const sampleCanvas = sampleCanvasRef.current ?? (sampleCanvasRef.current = document.createElement('canvas'));
          const stats = sampleVideoLumaStats(video, sampleCanvas);
          lastStats = stats;
          if (stats && isBrokenFrame(stats)) {
            console.warn('Camera returned a broken (near-black, flat) frame; retrying.', stats);
            brokenRetries += 1;
            return 'retry';
          }

          const captured = await captureFullFrame(video, canvas, facingModeRef.current);
          if (!captured) {
            encodeFailures += 1;
            return 'retry';
          }

          setCapturedImage(captured.dataUrl);
          onCapture(captured);
          stopCamera();
          return 'done';
        },
        { maxAttempts: CAPTURE_MAX_ATTEMPTS, delayMs: CAPTURE_RETRY_DELAY_MS }
      );

      if (!result.ok) {
        setCaptureNotice(encodeFailures > 0 ? CAPTURE_FAILED_MESSAGE : CAPTURE_NOT_READY_MESSAGE);
      }

      const finalStats = lastStats as LumaStats | null;
      const unlockedAt = diagRef.current.unlockedAt;
      reportDiagnostic('capture', {
        timing: unlockedAt ? { shutterDelayMs: tappedAt - unlockedAt } : undefined,
        capture: {
          outcome: result.ok ? 'ok' : encodeFailures > 0 ? 'failed' : 'not_ready',
          attempts: result.attempts,
          brokenRetries,
          notReadyRetries,
          lumaMean: finalStats?.mean,
          lumaStdDev: finalStats?.stdDev,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          outputWidth: canvas.width,
          outputHeight: canvas.height,
        },
      });
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
   * Calculate the stage size: the camera's own aspect ratio, so the whole camera image is
   * visible and is what gets recorded (camera#208).
   */
  useEffect(() => {
    const calculateSize = () => {
      if (!containerRef.current) return;
      
      const parent = containerRef.current.parentElement;
      if (!parent) return;
      
      // The parent's content box: clientWidth/clientHeight include its padding, which would make
      // the stage larger than the space it has and squeeze it out of the camera's aspect ratio.
      const parentStyle = window.getComputedStyle(parent);
      const paddingX = (parseFloat(parentStyle.paddingLeft) || 0) + (parseFloat(parentStyle.paddingRight) || 0);
      const paddingY = (parseFloat(parentStyle.paddingTop) || 0) + (parseFloat(parentStyle.paddingBottom) || 0);
      const availableWidth = parent.clientWidth - paddingX;
      const availableHeight = parent.clientHeight - paddingY;

      // The stage has the camera's own shape so the whole image is visible; until the video
      // reports its size, use the frame's aspect ratio (or 16:9).
      const targetAspect = cameraAspect ?? getTargetAspectRatio();

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
  }, [frameWidth, frameHeight, cameraAspect, previewAspectWidthOverHeight, getTargetAspectRatio]);

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
    const diag = diagRef.current;
    diag.attachedAt = performance.now();
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let warmupTimer: ReturnType<typeof setTimeout> | null = null;
    let frameCallbackId: number | null = null;
    const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function';

    // WHAT: unlocks the shutter a short warm-up after the first presented frame.
    // WHY: right after the stream starts the camera is still settling exposure and focus,
    //     and an early tap captures a near-black frame (camera#206).
    // Unlocks the shutter and reports how the stream started (once per stream); a missing
    // firstFrameMs means the unlock came from the timeout, i.e. no frame event arrived.
    const markShutterReady = () => {
      if (cancelled) return;
      setIsShutterReady(true);
      const now = performance.now();
      diag.unlockedAt = now;
      if (diag.streamEventSent) return;
      diag.streamEventSent = true;
      reportDiagnostic('stream_started', {
        requested: diag.requested,
        granted: diag.granted,
        timing: {
          startMs: diag.attachedAt - diag.requestedAt,
          firstFrameMs: diag.firstFrameAt ? diag.firstFrameAt - diag.attachedAt : undefined,
          shutterUnlockMs: now - diag.attachedAt,
        },
      });
    };

    const unlockShutterAfterWarmup = () => {
      if (cancelled || warmupTimer) return;
      diag.firstFrameAt = performance.now();
      warmupTimer = setTimeout(markShutterReady, SHUTTER_WARMUP_MS);
    };

    // Never leave the shutter dead if no frame event ever arrives on some browser.
    const shutterTimeout = setTimeout(markShutterReady, SHUTTER_READY_TIMEOUT_MS);

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
          setCameraAspect(video.videoWidth / video.videoHeight);
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
  }, [stream, reportDiagnostic]);

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
            {/* Live Video Stream - the whole camera image (the stage has the camera's shape), mirrored for the front camera */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
              style={{
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
              }}
            />

            {/* Frame guide: dims what the frame will not keep; the whole image is still recorded. */}
            {stream && frameGuide && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-10"
                style={{
                  left: `${frameGuide.left * 100}%`,
                  top: `${frameGuide.top * 100}%`,
                  width: `${frameGuide.width * 100}%`,
                  height: `${frameGuide.height * 100}%`,
                  boxShadow: '0 0 0 100vmax var(--gds-overlay-scrim)',
                  outline: `2px solid ${CAMERA_STAGE_WHITE}`,
                }}
              >
                {territories && territories.length > 0 && <FrameTerritories territories={territories} />}
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
            {!captureNotice && stream && frameGuide && isShutterReady && (
              <div className="absolute inset-x-0 bottom-2 z-20 p-2 text-center text-xs" role="note">
                {FRAME_GUIDE_HINT}
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
              className="w-full h-full object-contain"
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
                ? 'bottom-[max(1rem,var(--gds-safe-area-inset-bottom))] left-1/2 -translate-x-1/2'
                : orientation === 'landscape-right'
                  ? 'right-[max(1rem,var(--gds-safe-area-inset-right))] top-1/2 -translate-y-1/2'
                  : 'left-[max(1rem,var(--gds-safe-area-inset-left))] top-1/2 -translate-y-1/2'
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
                  ? 'bottom-[max(1rem,var(--gds-safe-area-inset-bottom))] right-[max(1rem,var(--gds-safe-area-inset-right))]'
                  : orientation === 'landscape-right'
                    ? 'bottom-[max(1rem,var(--gds-safe-area-inset-bottom))] right-[max(1rem,var(--gds-safe-area-inset-right))]'
                    : 'bottom-[max(1rem,var(--gds-safe-area-inset-bottom))] left-[max(1rem,var(--gds-safe-area-inset-left))]'
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
              ? 'bottom-[max(1rem,var(--gds-safe-area-inset-bottom))] left-1/2 -translate-x-1/2'
              : orientation === 'landscape-right'
                ? 'right-[max(1rem,var(--gds-safe-area-inset-right))] top-1/2 -translate-y-1/2'
                : 'left-[max(1rem,var(--gds-safe-area-inset-left))] top-1/2 -translate-y-1/2'
          }`}
        >
          Retake Photo
        </button>
      ) : null}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
