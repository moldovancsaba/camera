import type { TourStepConfig } from '../types';

/**
 * Three phase-scoped mini-tours, not one linear tour, because the capture
 * flow's DOM is conditionally mounted per `step` (select-frame / capture-photo
 * / preview) -- there is no single moment all targets coexist.
 */

export function getCaptureSelectFrameSteps(): TourStepConfig[] {
  return [
    {
      id: 'capture-frame-grid',
      targetSelector: '[data-tour-id="capture-frame-grid"]',
      title: 'Pick a frame',
      description: 'Choose the frame for your photo. You can change it again later.',
    },
  ];
}

export function getCapturePhotoSteps(options: { hasMultipleFrames: boolean }): TourStepConfig[] {
  const steps: TourStepConfig[] = [
    {
      id: 'capture-shutter',
      targetSelector: '[aria-label="Capture photo"]',
      title: 'Take your photo',
      description: 'Tap the shutter button when you’re ready to capture.',
    },
    {
      id: 'capture-switch-camera',
      targetSelector: '[aria-label="Switch camera"]',
      title: 'Switch camera',
      description: 'Toggle between your front and back camera.',
      // Device-dependent -- CameraCapture only renders this button when
      // hasMultipleCameras is true, and doesn't expose that state to the
      // parent, so availability is checked against the live DOM instead.
      isAvailable: () =>
        typeof document !== 'undefined' && !!document.querySelector('[aria-label="Switch camera"]'),
    },
  ];

  if (options.hasMultipleFrames) {
    steps.push({
      id: 'capture-change-frame',
      targetSelector: '[data-tour-id="capture-change-frame-button"]',
      title: 'Change frame',
      description: 'Not the right frame? Pick a different one here.',
    });
  }

  return steps;
}

export function getCapturePreviewSteps(): TourStepConfig[] {
  return [
    {
      id: 'capture-share-copy-link',
      targetSelector: '[data-tour-id="capture-share-copy-link"]',
      title: 'Copy your link',
      description: 'Copy the share link to send your photo anywhere.',
    },
    {
      id: 'capture-share-view-photo',
      targetSelector: '[data-tour-id="capture-share-view-photo"]',
      title: 'View your photo',
      description: 'Opens your saved photo in a new tab.',
    },
  ];
}
