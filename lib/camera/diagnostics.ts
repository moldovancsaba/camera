/**
 * Anonymous capture diagnostics (camera#204): the shape of one record, and the sanitizer the
 * public endpoint runs on whatever a browser sends. Pure and DOM-free so it is unit-tested.
 *
 * What a record never contains: images, names, emails, cookies, IP addresses, or any stable
 * device identifier (no deviceId, no camera label). `session` is random per page load and is
 * kept only in memory, so it links the two events of one capture session and nothing else.
 */

export const DIAGNOSTIC_VERSION = 1 as const;

/** Hard cap on the request body; a record is well under 1 KB. */
export const DIAGNOSTIC_MAX_BYTES = 4096;

export const DIAGNOSTIC_ENDPOINT = '/api/observability/capture-diagnostic';

export type DiagnosticKind = 'stream_started' | 'capture';
export type CaptureOutcome = 'ok' | 'not_ready' | 'failed';
export type FacingModeValue = 'user' | 'environment';

export interface CameraDiagnostic {
  v: typeof DIAGNOSTIC_VERSION;
  kind: DiagnosticKind;
  /** Random per page load, never stored on the device. */
  session: string;
  /** From `?cameraTest=<label>` so the owner's phone tests can be found in the logs. */
  testRun?: string;
  facingMode?: FacingModeValue;
  requested?: {
    mode?: 'preferred' | 'relaxed';
    width?: number;
    height?: number;
    aspectRatio?: number;
  };
  /** What `track.getSettings()` reported (the granted mode). */
  granted?: {
    width?: number;
    height?: number;
    frameRate?: number;
    aspectRatio?: number;
    facingMode?: string;
    resizeMode?: string;
  };
  deviceCount?: number;
  timing?: {
    /** getUserMedia start to stream attached. */
    startMs?: number;
    /** Stream attached to the first presented video frame. */
    firstFrameMs?: number;
    /** Stream attached to the shutter unlocking. */
    shutterUnlockMs?: number;
    /** Shutter unlocked to the tap (capture events). */
    shutterDelayMs?: number;
  };
  capture?: {
    outcome: CaptureOutcome;
    attempts?: number;
    brokenRetries?: number;
    notReadyRetries?: number;
    lumaMean?: number;
    lumaStdDev?: number;
    videoWidth?: number;
    videoHeight?: number;
    outputWidth?: number;
    outputHeight?: number;
  };
  page?: {
    orientation?: 'portrait' | 'landscape';
    viewportWidth?: number;
    viewportHeight?: number;
    devicePixelRatio?: number;
  };
}

const SESSION_PATTERN = /^[a-z0-9-]{8,40}$/;
const TEST_RUN_PATTERN = /^[a-z0-9_-]{1,32}$/;
const FACING_MODES: readonly string[] = ['user', 'environment'];
const GRANTED_FACING: readonly string[] = ['user', 'environment', 'left', 'right'];
const RESIZE_MODES: readonly string[] = ['none', 'crop-and-scale'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, min: number, max: number, decimals = 0): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.min(max, Math.max(min, value));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function oneOf<T extends string>(value: unknown, allowed: readonly string[]): T | undefined {
  return typeof value === 'string' && allowed.includes(value) ? (value as T) : undefined;
}

/** Drops undefined members so records stay small and comparable in tests. */
function compact<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * Returns a record containing only allowlisted, range-clamped fields, or null when the input
 * is not a valid record of this version. Unknown fields are dropped, never passed through.
 */
export function sanitizeDiagnostic(input: unknown): CameraDiagnostic | null {
  if (!isRecord(input) || input.v !== DIAGNOSTIC_VERSION) return null;

  const kind = oneOf<DiagnosticKind>(input.kind, ['stream_started', 'capture']);
  if (!kind) return null;

  const session = typeof input.session === 'string' ? input.session.trim().toLowerCase() : '';
  if (!SESSION_PATTERN.test(session)) return null;

  const testRunRaw = typeof input.testRun === 'string' ? input.testRun.trim().toLowerCase() : '';

  const out: CameraDiagnostic = { v: DIAGNOSTIC_VERSION, kind, session };
  if (TEST_RUN_PATTERN.test(testRunRaw)) out.testRun = testRunRaw;

  const facingMode = oneOf<FacingModeValue>(input.facingMode, FACING_MODES);
  if (facingMode) out.facingMode = facingMode;

  if (isRecord(input.requested)) {
    const r = input.requested;
    const requested = compact({
      mode: oneOf<'preferred' | 'relaxed'>(r.mode, ['preferred', 'relaxed']),
      width: num(r.width, 0, 8192),
      height: num(r.height, 0, 8192),
      aspectRatio: num(r.aspectRatio, 0.1, 10, 3),
    });
    if (requested) out.requested = requested;
  }

  if (isRecord(input.granted)) {
    const g = input.granted;
    const granted = compact({
      width: num(g.width, 0, 16384),
      height: num(g.height, 0, 16384),
      frameRate: num(g.frameRate, 0, 240, 1),
      aspectRatio: num(g.aspectRatio, 0.1, 10, 3),
      facingMode: oneOf<string>(g.facingMode, GRANTED_FACING),
      resizeMode: oneOf<string>(g.resizeMode, RESIZE_MODES),
    });
    if (granted) out.granted = granted;
  }

  const deviceCount = num(input.deviceCount, 0, 32);
  if (deviceCount !== undefined) out.deviceCount = deviceCount;

  if (isRecord(input.timing)) {
    const t = input.timing;
    const timing = compact({
      startMs: num(t.startMs, 0, 600000),
      firstFrameMs: num(t.firstFrameMs, 0, 600000),
      shutterUnlockMs: num(t.shutterUnlockMs, 0, 600000),
      shutterDelayMs: num(t.shutterDelayMs, 0, 3600000),
    });
    if (timing) out.timing = timing;
  }

  if (isRecord(input.capture)) {
    const c = input.capture;
    const outcome = oneOf<CaptureOutcome>(c.outcome, ['ok', 'not_ready', 'failed']);
    if (outcome) {
      out.capture = {
        outcome,
        ...compact({
          attempts: num(c.attempts, 0, 20),
          brokenRetries: num(c.brokenRetries, 0, 20),
          notReadyRetries: num(c.notReadyRetries, 0, 20),
          lumaMean: num(c.lumaMean, 0, 255, 1),
          lumaStdDev: num(c.lumaStdDev, 0, 255, 1),
          videoWidth: num(c.videoWidth, 0, 16384),
          videoHeight: num(c.videoHeight, 0, 16384),
          outputWidth: num(c.outputWidth, 0, 16384),
          outputHeight: num(c.outputHeight, 0, 16384),
        }),
      };
    }
  }

  if (kind === 'capture' && !out.capture) return null;

  if (isRecord(input.page)) {
    const p = input.page;
    const page = compact({
      orientation: oneOf<'portrait' | 'landscape'>(p.orientation, ['portrait', 'landscape']),
      viewportWidth: num(p.viewportWidth, 0, 20000),
      viewportHeight: num(p.viewportHeight, 0, 20000),
      devicePixelRatio: num(p.devicePixelRatio, 0.5, 10, 1),
    });
    if (page) out.page = page;
  }

  return out;
}
