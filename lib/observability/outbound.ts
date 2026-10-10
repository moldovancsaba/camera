/**
 * Outbound calls with a deadline and one log line for every outcome (issue 178).
 *
 * WHAT: `fetchBounded` is `fetch` with an `AbortSignal.timeout`. A peer that does not answer in time ends in an
 *     `OutboundTimeoutError` (name `TimeoutError`, a message that says which call and how long); any other network
 *     failure is rethrown unchanged. `logOutbound` writes the one structured line for a call: `ok`, `empty`
 *     (answered, nothing usable), `refused` (an error status), `timeout` or `failed`.
 * WHY: a hung SSO or messmass must cost a user a fixed amount of time, and the keep-or-drop decision about the
 *     messmass login push needs numbers: the log line is what a production query counts. The line carries the
 *     outcome, the HTTP status, the time taken and the deadline, and nothing else: never a token, a secret, an
 *     address with a query, a response body or a person's data.
 */
import { logInfo, logWarn } from './logger';

/** `ok` the call did its job; `empty` the peer answered 2xx but gave nothing usable; `refused` an error status; `timeout`; `failed` (network). */
export type OutboundOutcome = 'ok' | 'empty' | 'refused' | 'timeout' | 'failed';

/** What a log line may say about one call. Every field is a number or a short code; nothing here can hold a secret. */
export interface OutboundLogContext {
  /** HTTP status when the peer answered. */
  status?: number;
  /** How long the call took, in milliseconds. */
  durationMs?: number;
  /** The deadline the call was given, in milliseconds. */
  timeoutMs?: number;
  /** Anything else that is a count or a short code of ours (never free text from the peer). */
  [key: string]: number | string | boolean | undefined;
}

/** The peer did not answer within its deadline. Its name is the one `AbortSignal.timeout` uses, so existing checks keep working. */
export class OutboundTimeoutError extends Error {
  readonly call: string;
  readonly timeoutMs: number;

  constructor(call: string, timeoutMs: number) {
    super(`${call} did not answer within ${timeoutMs} ms`);
    this.name = 'TimeoutError';
    this.call = call;
    this.timeoutMs = timeoutMs;
  }
}

/** True for the error a fired `AbortSignal.timeout` produces (and for our own wrapper of it). */
export function isTimeoutError(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** A short upper-case code (ECONNREFUSED, ENOTFOUND, ...) of a network failure, or undefined. Never the message, which can carry an address. */
function failureCode(error: unknown): string | undefined {
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  const code = cause && typeof cause === 'object' ? (cause as { code?: unknown }).code : (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{3,40}$/.test(code) ? code : undefined;
}

/** One line per call: `event` is the stable tag a log query filters on (for example `messmass.session_push`). */
export function logOutbound(event: string, outcome: OutboundOutcome, context: OutboundLogContext = {}): void {
  const fields = { outcome, ...context };
  if (outcome === 'ok') logInfo(event, `${event}: ${outcome}`, fields);
  else logWarn(event, `${event}: ${outcome}`, fields);
}

/**
 * `fetch` that gives up after `timeoutMs`. A timeout or a network failure is logged under `event` and thrown
 * (`OutboundTimeoutError` for a timeout, the original error otherwise); a response of any status is returned and the
 * caller logs `ok` or `refused` with `logOutbound`, because only the caller knows what counts as success.
 */
export async function fetchBounded(event: string, call: string, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const started = Date.now();
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const durationMs = Date.now() - started;
    if (isTimeoutError(error)) {
      logOutbound(event, 'timeout', { durationMs, timeoutMs });
      throw new OutboundTimeoutError(call, timeoutMs);
    }
    logOutbound(event, 'failed', { durationMs, timeoutMs, errorName: error instanceof Error ? error.name : 'unknown', code: failureCode(error) });
    throw error;
  }
}
