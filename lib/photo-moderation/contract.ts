/** The versioned result contract Camera accepts from the shared Hetzner moderation task. */

export const MODERATION_CATEGORIES = [
  'nudity',
  'sexualContent',
  'middleFinger',
  'hateSymbols',
  'hateWords',
  'alcohol',
  'drugs',
  'violence',
  'weapons',
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];
export type CategorySignal = 'detected' | 'not_detected' | 'uncertain';
export type ModerationSignal = 'flagged' | 'uncertain' | 'no_flags_detected';

export interface CameraModerationResult {
  schema_version: 'camera-moderation.v1';
  model: string;
  review_required: true;
  automated_decision: 'none';
  signal: ModerationSignal;
  flags: ModerationCategory[];
  categories: Record<ModerationCategory, CategorySignal>;
  evidence: string;
  limitations: string;
  timing?: { model_load_seconds?: number; inference_seconds?: number };
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value: unknown, max: number): string | null => typeof value === 'string' && value.length <= max ? value : null;

/** Reject partial, inconsistent, or future-shaped results; malformed output is never shown as a clear scan. */
export function parseCameraModerationResult(value: unknown): CameraModerationResult | null {
  if (!isRecord(value) || value.schema_version !== 'camera-moderation.v1' || value.review_required !== true || value.automated_decision !== 'none') return null;
  const model = boundedText(value.model, 160);
  const evidence = boundedText(value.evidence, 800);
  const limitations = boundedText(value.limitations, 800);
  const rawCategories = value.categories;
  const rawFlags = value.flags;
  if (!model || evidence === null || limitations === null || !isRecord(rawCategories) || !Array.isArray(rawFlags)) return null;

  const categories = {} as Record<ModerationCategory, CategorySignal>;
  for (const category of MODERATION_CATEGORIES) {
    const signal = rawCategories[category];
    if (signal !== 'detected' && signal !== 'not_detected' && signal !== 'uncertain') return null;
    categories[category] = signal;
  }
  if (Object.keys(rawCategories).length !== MODERATION_CATEGORIES.length) return null;

  const flags: ModerationCategory[] = [];
  for (const flag of rawFlags) {
    if (typeof flag !== 'string' || !MODERATION_CATEGORIES.includes(flag as ModerationCategory) || flags.includes(flag as ModerationCategory)) return null;
    flags.push(flag as ModerationCategory);
  }
  const detected = MODERATION_CATEGORIES.filter((category) => categories[category] === 'detected');
  const signal: ModerationSignal = detected.length
    ? 'flagged'
    : MODERATION_CATEGORIES.some((category) => categories[category] === 'uncertain')
      ? 'uncertain'
      : 'no_flags_detected';
  if (value.signal !== signal || flags.length !== detected.length || flags.some((flag) => !detected.includes(flag))) return null;

  const timing = isRecord(value.timing) ? {
    ...(typeof value.timing.model_load_seconds === 'number' && Number.isFinite(value.timing.model_load_seconds) && value.timing.model_load_seconds >= 0 ? { model_load_seconds: value.timing.model_load_seconds } : {}),
    ...(typeof value.timing.inference_seconds === 'number' && Number.isFinite(value.timing.inference_seconds) && value.timing.inference_seconds >= 0 ? { inference_seconds: value.timing.inference_seconds } : {}),
  } : undefined;
  return {
    schema_version: 'camera-moderation.v1',
    model,
    review_required: true,
    automated_decision: 'none',
    signal,
    flags,
    categories,
    evidence,
    limitations,
    ...(timing && Object.keys(timing).length ? { timing } : {}),
  };
}
