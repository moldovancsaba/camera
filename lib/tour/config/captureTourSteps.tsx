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
  // Touch devices take the photo with their own camera app (camera#257): there is no live shutter on the page, only the "Take photo" button, so that is what
  // the tour points at. Changing between the cameras is done in the camera app; the page has no switch (owner, 2026-10-09).
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
