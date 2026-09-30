/**
 * Constant-time shared-secret checks (CAM-05 / SEC-09).
 *
 * WHAT: `safeEqual` compares two strings in constant time: it hashes both
 *     with SHA-256 and compares the two 32-byte digests with
 *     crypto.timingSafeEqual. `checkSharedSecret` wraps it with the
 *     fail-closed rules every service-secret gate needs and says why a call
 *     was rejected; `logSharedSecretRejection` records that reason
 *     server-side, so the 403 body the caller sees can stay a generic
 *     "Forbidden".
 * WHY: The service-to-service gates (the messmass, fanmass, savetheworld and
 *     try-on internal APIs, the try-on sync cron, the try-on setup-selection
 *     service call) compared secrets with ===, which stops at the first
 *     differing character. Hashing first hands timingSafeEqual two buffers of
 *     equal length, so neither the content nor the length of the configured
 *     secret shows up in response timing (timingSafeEqual throws on unequal
 *     lengths, and a length pre-check would itself leak the length). The
 *     old 403 bodies also named the unset env var ("CAMERA_..._SECRET is not
 *     configured"), which told any unauthenticated caller which integrations
 *     are switched on.
 * Fail closed: an empty or unset value never matches, not even another
 *     empty value. An unset secret means nobody gets in, never "anyone who
 *     sends an empty header gets in".
 */

import crypto from 'crypto';

function sha256(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

/**
 * True only when both values are non-empty strings with identical content.
 * The comparison time does not depend on where the strings differ or on
 * their lengths.
 */
export function safeEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (provided.length === 0 || expected.length === 0) return false;
  return crypto.timingSafeEqual(sha256(provided), sha256(expected));
}

export type SharedSecretCheck = 'ok' | 'not_configured' | 'missing' | 'mismatch';

/**
 * Classifies a shared-secret check. Only 'ok' may be let through; every
 * other result must be answered with a generic 403.
 * - not_configured: the server-side secret (env var) is unset or empty.
 * - missing: the caller sent no credential.
 * - mismatch: the caller sent a credential that does not match.
 */
export function checkSharedSecret(
  configured: string | null | undefined,
  provided: string | null | undefined
): SharedSecretCheck {
  if (!configured) return 'not_configured';
  if (!provided) return 'missing';
  return safeEqual(provided, configured) ? 'ok' : 'mismatch';
}

/**
 * Server-side record of a rejected service call; the detail that used to be
 * in the 403 body. Never logs the presented or the configured secret.
 * - not_configured is a deployment error, so it is console.error and names
 *   the env var the operator has to set.
 * - mismatch is console.warn: someone presented a wrong credential.
 * - missing is not logged. Scanners hitting /api/internal/* would flood the
 *   log, and the internal email route tries the messmass secret before the
 *   fanmass one, so every legitimate fanmass call (x-fanmass-secret header)
 *   is a "missing" on the messmass check first.
 */
export function logSharedSecretRejection(
  gate: string,
  envVar: string,
  result: Exclude<SharedSecretCheck, 'ok'>
): void {
  if (result === 'not_configured') {
    console.error(`[internal-auth] ${gate}: ${envVar} is not configured; rejecting the call (fail closed)`);
  } else if (result === 'mismatch') {
    console.warn(`[internal-auth] ${gate}: presented secret does not match ${envVar}; rejecting the call`);
  }
}
