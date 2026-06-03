import type { EventSharePageSettings } from '@/lib/events/share-page-settings';

export interface ShareVariantCard {
  id: string;
  imageUrl: string;
  label: string;
  isTryOn?: boolean;
}

export interface TryOnShareVariantSource {
  _id?: {
    toString: () => string;
  };
  imageUrl?: string | null;
  finalImageUrl?: string | null;
  tryOnLeatherSuitId?: string | null;
  metadata?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

type ShareVariantSuffix =
  | ':original-capture'
  | ':camera-result'
  | ':tryon-result'
  | ':tryon-generated'
  | ':tryon-framed'
  | ':tryon-checked-in';

type ShareVariantMode =
  | 'original-capture'
  | 'camera-result'
  | 'tryon-result'
  | 'tryon-framed'
  | 'tryon-checked-in';

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

  if (settings.includeCheckedInTryOnResult) {
    modes.push('tryon-checked-in');
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
  if (mode === 'tryon-checked-in') {
    return [':tryon-checked-in'];
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

function resolveCheckedInVariantCard(
  variant: TryOnShareVariantSource,
  settings: EventSharePageSettings
): ShareVariantCard | null {
  const id = variant._id?.toString() ?? '';
  const metadata =
    variant.metadata && typeof variant.metadata === 'object'
      ? (variant.metadata as { compositionEngine?: unknown; tryOnRawResultUrl?: unknown })
      : {};
  const resultUrl = readString(variant.imageUrl) || readString(variant.finalImageUrl);
  const rawResultUrl = readString(metadata.tryOnRawResultUrl);
  const isFramed = metadata.compositionEngine === 'motogp_leather_magic_framed';
  const suitLabel = readString(variant.tryOnLeatherSuitId) || 'Approved try-on result';
  const preferFramed = settings.includeFramedTryOnResult || !settings.includeTryOnResult;
  const preferRaw = settings.includeTryOnResult || !settings.includeFramedTryOnResult;

  if (isFramed && preferFramed && resultUrl) {
    return {
      id: `${id}:tryon-checked-in`,
      imageUrl: resultUrl,
      label: `${suitLabel} - checked-in`,
      isTryOn: true,
    };
  }

  if (preferRaw && rawResultUrl) {
    return {
      id: `${id}:tryon-checked-in`,
      imageUrl: rawResultUrl,
      label: `${suitLabel} - checked-in`,
      isTryOn: true,
    };
  }

  if (resultUrl) {
    return {
      id: `${id}:tryon-checked-in`,
      imageUrl: resultUrl,
      label: `${suitLabel} - checked-in`,
      isTryOn: true,
    };
  }

  return null;
}

export function buildCheckedInTryOnVariantCard(
  variant: TryOnShareVariantSource,
  settings: EventSharePageSettings
): ShareVariantCard | null {
  return resolveCheckedInVariantCard(variant, settings);
}

export function pickFirstCheckedInTryOnVariantCard(
  variants: TryOnShareVariantSource[],
  settings: EventSharePageSettings
): ShareVariantCard | null {
  for (const variant of variants) {
    const card = buildCheckedInTryOnVariantCard(variant, settings);
    if (card) {
      return card;
    }
  }
  return null;
}
