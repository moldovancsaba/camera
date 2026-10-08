import type { TourStepConfig } from '../types';
import { translate, type UiLanguage } from '@/lib/i18n';

/**
 * Three phase-scoped mini-tours, not one linear tour, because the capture
 * flow's DOM is conditionally mounted per `step` (select-frame / capture-photo
 * / preview) -- there is no single moment all targets coexist.
 */

export function getCaptureSelectFrameSteps(language: UiLanguage = 'en'): TourStepConfig[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return [
    {
      id: 'capture-frame-grid',
      targetSelector: '[data-tour-id="capture-frame-grid"]',
      title: t('tour.pickFrame.title'),
      description: t('tour.pickFrame.text'),
    },
  ];
}

export function getCapturePhotoSteps(options: { hasMultipleFrames: boolean; method?: 'system' | 'still' | 'frame' | null; language?: UiLanguage }): TourStepConfig[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(options.language ?? 'en', key);
  // Touch devices take the photo with their own camera app (camera#257): there is no live shutter or camera switch on the
  // page, only the "Take photo" button, so that is what the tour points at.
  const deviceCameraSteps: TourStepConfig[] = [
    {
      id: 'capture-take-photo',
      targetSelector: '[data-tour-id="capture-take-photo"]',
      title: t('tour.takePhoto.title'),
      description: t('tour.takePhoto.deviceText'),
    },
  ];

  const liveCameraSteps: TourStepConfig[] = [
    {
      id: 'capture-shutter',
      targetSelector: '[data-tour-id="capture-shutter"]',
      title: t('tour.takePhoto.title'),
      description: t('tour.shutter.text'),
    },
    {
      id: 'capture-switch-camera',
      targetSelector: '[data-tour-id="capture-switch-camera"]',
      title: t('tour.switchCamera.title'),
      description: t('tour.switchCamera.text'),
      // Device-dependent -- CameraCapture only renders this button when
      // hasMultipleCameras is true, and doesn't expose that state to the
      // parent, so availability is checked against the live DOM instead.
      isAvailable: () =>
        typeof document !== 'undefined' && !!document.querySelector('[data-tour-id="capture-switch-camera"]'),
    },
  ];

  const steps = options.method === 'system' ? deviceCameraSteps : liveCameraSteps;

  if (options.hasMultipleFrames) {
    steps.push({
      id: 'capture-change-frame',
      targetSelector: '[data-tour-id="capture-change-frame-button"]',
      title: t('tour.changeFrame.title'),
      description: t('tour.changeFrame.text'),
    });
  }

  return steps;
}

export function getCapturePreviewSteps(language: UiLanguage = 'en'): TourStepConfig[] {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return [
    {
      id: 'capture-share-copy-link',
      targetSelector: '[data-tour-id="capture-share-copy-link"]',
      title: t('tour.copyLink.title'),
      description: t('tour.copyLink.text'),
    },
    {
      id: 'capture-share-view-photo',
      targetSelector: '[data-tour-id="capture-share-view-photo"]',
      title: t('tour.viewPhoto.title'),
      description: t('tour.viewPhoto.text'),
    },
  ];
}
