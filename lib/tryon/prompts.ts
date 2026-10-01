import { createHash } from 'node:crypto';
import type { TryOnPromptConfig, TryOnPromptSnapshot } from '@/lib/db/schemas';

export const MAX_POSITIVE_PROMPT_LENGTH = 6000;
export const MAX_NEGATIVE_PROMPT_LENGTH = 4000;

function normalizePrompt(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
}

export type PromptConfigResult =
  | { ok: true; config: TryOnPromptConfig | null }
  | { ok: false; code: 'invalid_positive_prompt' | 'invalid_negative_prompt' | 'negative_without_positive' };

export function buildTryOnPromptConfig(
  positiveValue: unknown,
  negativeValue: unknown,
  existing?: TryOnPromptConfig | null
): PromptConfigResult {
  const positive = normalizePrompt(positiveValue, MAX_POSITIVE_PROMPT_LENGTH);
  if (positive === null) return { ok: false, code: 'invalid_positive_prompt' };
  const negative = normalizePrompt(negativeValue, MAX_NEGATIVE_PROMPT_LENGTH);
  if (negative === null) return { ok: false, code: 'invalid_negative_prompt' };
  if (!positive && negative) return { ok: false, code: 'negative_without_positive' };
  if (!positive) return { ok: true, config: null };

  const unchanged = existing?.positive === positive && existing?.negative === negative;
  return {
    ok: true,
    config: {
      version: unchanged ? existing.version : (existing?.version ?? 0) + 1,
      positive,
      negative,
    },
  };
}

export type PromptSnapshotResult =
  | { ok: true; snapshot: TryOnPromptSnapshot }
  | { ok: false; code: 'invalid_positive_prompt' | 'invalid_negative_prompt' | 'negative_without_positive' };

export function buildTryOnPromptSnapshot(input: {
  setupId: string | null;
  version: number;
  positive: unknown;
  negative: unknown;
  source: TryOnPromptSnapshot['source'];
  createdAt: string;
  createdBy?: string | null;
  reason?: string | null;
}): PromptSnapshotResult {
  const prompts = buildTryOnPromptConfig(input.positive, input.negative);
  if (!prompts.ok) return prompts;
  if (!prompts.config) return { ok: false, code: 'invalid_positive_prompt' };

  const value = {
    setupId: input.setupId,
    version: Number.isSafeInteger(input.version) && input.version > 0 ? input.version : 1,
    positive: prompts.config.positive,
    negative: prompts.config.negative,
    source: input.source,
    createdAt: input.createdAt,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  };
  const fingerprint = JSON.stringify({
    setupId: value.setupId,
    version: value.version,
    positive: value.positive,
    negative: value.negative,
  });
  const sha256 = createHash('sha256').update(fingerprint).digest('hex');
  return { ok: true, snapshot: { ...value, sha256 } };
}
