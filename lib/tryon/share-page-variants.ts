import type { EventSharePageSettings } from '@/lib/events/share-page-settings';

export interface ShareVariantCard {
  id: string;
  imageUrl: string;
  label: string;
  isTryOn?: boolean;
}

type ShareVariantSuffix =
  | ':original-capture'
  | ':camera-result'
  | ':tryon-result'
  | ':tryon-generated'
  | ':tryon-framed';

type ShareVariantMode =
  | 'original-capture'
  | 'camera-result'
  | 'tryon-result'
  | 'tryon-framed';

function resolveActiveVariantModes(settings: EventSharePageSettings): ShareVariantMode[] {
  const modes: ShareVariantMode[] = [];
  if (settings.includeOriginalCapture) {
    modes.push('original-capture');
  }

  if (settings.includeCameraResult) {
    modes.push('camera-result');
  }

  if (settings.includeTryOnResult) {
    modes.push('tryon-result');
  }

  if (settings.includeFramedTryOnResult) {
    modes.push('tryon-framed');
  }

  return modes;
}

function resolveSuffixesForMode(mode: ShareVariantMode): ShareVariantSuffix[] {
  if (mode === 'original-capture') {
    return [':original-capture'];
  }
  if (mode === 'camera-result') {
    return [':camera-result'];
  }
  if (mode === 'tryon-framed') {
    return [':tryon-framed'];
  }
  return [':tryon-result', ':tryon-generated'];
}

function findFirstMatchingSuffixIndex(variants: ShareVariantCard[], suffixes: readonly ShareVariantSuffix[]): number {
  for (const suffix of suffixes) {
    const index = variants.findIndex((variant) => variant.id.endsWith(suffix));
    if (index >= 0) return index;
  }
  return -1;
}

export function limitShareVariantsToConfiguredMode(variants: ShareVariantCard[], settings: EventSharePageSettings): ShareVariantCard[] {
  const activeModes = resolveActiveVariantModes(settings);
  if (activeModes.length !== 1) {
    return variants;
  }

  const mode = activeModes[0];
  const suffixes = resolveSuffixesForMode(mode);
  const targetIndex = findFirstMatchingSuffixIndex(variants, suffixes);
  if (targetIndex < 0) {
    return [];
  }

  return [variants[targetIndex]];
}
