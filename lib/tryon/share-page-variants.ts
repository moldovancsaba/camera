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
  createdAt?: unknown;
  approvedAt?: unknown;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isFramedByComparison(
  resultUrl: string | null,
  rawResultUrl: string | null,
  compositionEngine: unknown
): boolean {
  if (compositionEngine === 'motogp_leather_magic_framed') {
    return true;
  }
  if (!resultUrl || !rawResultUrl) {
    return false;
  }
  return resultUrl !== rawResultUrl;
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

function readDateEpoch(value: unknown): number {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function buildCheckedInCandidate(
  variant: TryOnShareVariantSource,
  settings: EventSharePageSettings
): { card: ShareVariantCard; rank: number; timestamp: number } | null {
  const id = variant._id?.toString() ?? '';
  const metadata =
    variant.metadata && typeof variant.metadata === 'object'
      ? (variant.metadata as { compositionEngine?: unknown; tryOnRawResultUrl?: unknown })
      : {};
  const resultUrl = readString(variant.imageUrl) || readString(variant.finalImageUrl);
  const rawResultUrl = readString(metadata.tryOnRawResultUrl);
  const isFramed = isFramedByComparison(
    resultUrl,
    rawResultUrl,
    metadata.compositionEngine
  );
  const suitLabel = readString(variant.tryOnLeatherSuitId) || 'Approved try-on result';

  const canUseFramed = Boolean(resultUrl && isFramed);
  const canUseRaw = Boolean(rawResultUrl);
  const canUseFallback = Boolean(resultUrl);
  if (!canUseFramed && !canUseRaw && !canUseFallback) {
    return null;
  }

  let rank = 1;
  let imageUrl: string | null = null;

  if (settings.includeFramedTryOnResult && canUseFramed) {
    rank = 400;
    imageUrl = resultUrl;
  } else if (settings.includeTryOnResult && canUseRaw) {
    rank = 300;
    imageUrl = rawResultUrl;
  } else if (settings.includeCheckedInTryOnResult && settings.includeTryOnResult && canUseFramed) {
    rank = 200;
    imageUrl = resultUrl;
  } else if (canUseFramed) {
    rank = 140;
    imageUrl = resultUrl;
  } else if (canUseRaw) {
    rank = 120;
    imageUrl = rawResultUrl;
  } else {
    rank = 80;
    imageUrl = resultUrl;
  }

  if (!imageUrl) {
    return null;
  }

  return {
    rank,
    timestamp: Math.max(readDateEpoch(variant.approvedAt), readDateEpoch(variant.createdAt)),
    card: {
      id: `${id}:tryon-checked-in`,
      imageUrl,
      label: `${suitLabel} - checked-in`,
      isTryOn: true,
    },
  };
}

export function buildCheckedInTryOnVariantCard(
  variant: TryOnShareVariantSource,
  settings: EventSharePageSettings
): ShareVariantCard | null {
  return buildCheckedInCandidate(variant, settings)?.card ?? null;
}

export function pickFirstCheckedInTryOnVariantCard(
  variants: TryOnShareVariantSource[],
  settings: EventSharePageSettings
): ShareVariantCard | null {
  const candidates = variants
    .map((variant) => buildCheckedInCandidate(variant, settings))
    .filter((value): value is { card: ShareVariantCard; rank: number; timestamp: number } => Boolean(value));

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
    return a.card.label.localeCompare(b.card.label);
  });

  return candidates[0].card;
}
