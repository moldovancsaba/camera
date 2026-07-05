/**
 * Structured logging + server error reporting (GitHub #83).
 *
 * Why this module exists:
 * - The v2.14.0 production crash (digest 4053814135) was invisible until logs
 *   were tailed by hand. Ad-hoc `console.error(...)` calls scattered across the
 *   API layer are not queryable or alertable.
 * - This emits a single-line JSON record per event to stdout/stderr. Vercel
 *   (and any log drain) ingests those lines; you can filter on
 *   `"level":"error"` / `"event":"..."` and configure alerts on new server
 *   errors from the platform side — no external SDK or DSN required.
 *
 * Design choice: structured stdout over an external sink (e.g. Sentry). Camera
 * is a low-ops Vercel deployment with no CI secrets configured; a
 * dependency-free structured log keeps the guarantee self-contained. To ship to
 * a dedicated sink later, forward these records from a Vercel Log Drain or swap
 * the `emit()` transport — callers do not change.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface StructuredLog {
  level: LogLevel;
  event: string;
  message: string;
  timestamp: string;
  digest?: string;
  stack?: string;
  context?: LogContext;
}

/**
 * Serialize + write one structured record. Errors go to stderr, everything else
 * to stdout, so platform log routing can split them.
 */
function emit(record: StructuredLog): void {
  const line = JSON.stringify(record);
  if (record.level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function toErrorFields(error: unknown): { message: string; stack?: string; digest?: string } {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: string }).digest;
    return { message: error.message, stack: error.stack, digest };
  }
  return { message: typeof error === 'string' ? error : 'Non-Error thrown value' };
}

export function logInfo(event: string, message: string, context?: LogContext): void {
  emit({ level: 'info', event, message, timestamp: nowIso(), context });
}

export function logWarn(event: string, message: string, context?: LogContext): void {
  emit({ level: 'warn', event, message, timestamp: nowIso(), context });
}

/**
 * Report a server-side error as a structured record. Use in API catch paths,
 * background jobs, and any server code that today calls `console.error`.
 *
 * @param event - stable dot-scoped tag, e.g. 'api.error', 'db.operation_failed'
 * @param error - the thrown value (Error preferred; digest is extracted if present)
 * @param context - request metadata (url, method, operation, ids…)
 */
export function reportServerError(event: string, error: unknown, context?: LogContext): void {
  const { message, stack, digest } = toErrorFields(error);
  emit({ level: 'error', event, message, stack, digest, timestamp: nowIso(), context });
}
