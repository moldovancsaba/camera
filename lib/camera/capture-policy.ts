/**
 * Capture policy for components/camera/CameraCapture.tsx: when the shutter may be used, what
 * counts as a broken (black) frame, and how many times a capture is re-tried. Pure and
 * DOM-free so it is unit-tested (capture-policy.test.ts); camera#206.
 *
 * The numbers are starting values. The capture diagnostics (camera#204) show per device and
 * browser whether they are right; tune them there, not by guesswork.
 */

/** Time after the first presented video frame before the shutter unlocks (exposure and focus settle). */
export const SHUTTER_WARMUP_MS = 600;

/** The shutter unlocks after this long even if no frame event arrives, so it is never dead. */
export const SHUTTER_READY_TIMEOUT_MS = 4000;

/** Frames drawn at most this many times per tap before the user is told to tap again. */
export const CAPTURE_MAX_ATTEMPTS = 6;

/** Pause between attempts; six attempts take about 0.7 s. */
export const CAPTURE_RETRY_DELAY_MS = 120;

/** A frame is "broken" only when it is this dark on average ... */
export const BROKEN_FRAME_MAX_MEAN = 6;

/** ... and this flat (standard deviation of brightness). A dark scene has detail, so it passes. */
export const BROKEN_FRAME_MAX_STDDEV = 3;

export const CAPTURE_NOT_READY_MESSAGE = 'The camera is not ready yet. Tap Take again.';
export const CAPTURE_FAILED_MESSAGE = 'Failed to capture the photo. Tap Take again.';

export interface LumaStats {
  mean: number;
  stdDev: number;
}

/** Brightness (Rec. 601 luma, 0-255) mean and standard deviation of RGBA pixel data. */
export function lumaStats(rgba: ArrayLike<number>): LumaStats {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) {
    return { mean: 0, stdDev: 0 };
  }

  let sum = 0;
  let sumSquares = 0;
  for (let i = 0; i < pixels; i += 1) {
    const offset = i * 4;
    const luma = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2];
    sum += luma;
    sumSquares += luma * luma;
  }

  const mean = sum / pixels;
  const variance = Math.max(0, sumSquares / pixels - mean * mean);
  return { mean, stdDev: Math.sqrt(variance) };
}

/** True for a near-black, almost flat frame (a camera that has not produced real data yet). */
export function isBrokenFrame(stats: LumaStats): boolean {
  return stats.mean < BROKEN_FRAME_MAX_MEAN && stats.stdDev < BROKEN_FRAME_MAX_STDDEV;
}

export type AttemptOutcome = 'done' | 'retry';

export interface BoundedAttemptsResult {
  ok: boolean;
  attempts: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `attempt` until it reports 'done', at most `maxAttempts` times with `delayMs` between
 * tries. Never loops forever: the caller gets `ok: false` and can tell the user.
 */
export async function runBoundedAttempts(
  attempt: (attemptNumber: number) => Promise<AttemptOutcome>,
  options: { maxAttempts: number; delayMs: number },
  sleep: (ms: number) => Promise<void> = defaultSleep
): Promise<BoundedAttemptsResult> {
  for (let attemptNumber = 1; attemptNumber <= options.maxAttempts; attemptNumber += 1) {
    const outcome = await attempt(attemptNumber);
    if (outcome === 'done') {
      return { ok: true, attempts: attemptNumber };
    }
    if (attemptNumber < options.maxAttempts) {
      await sleep(options.delayMs);
    }
  }
  return { ok: false, attempts: options.maxAttempts };
}
