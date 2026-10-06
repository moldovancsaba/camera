/**
 * Browser side of the capture diagnostics (camera#204): builds the page-level fields and sends
 * a record without ever blocking or breaking capture. Failures are swallowed on purpose.
 */

import { DIAGNOSTIC_ENDPOINT, DIAGNOSTIC_MAX_BYTES, type CameraDiagnostic } from './diagnostics';

/** Random per page load; kept in memory only. */
export function newDiagnosticSession(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the non-crypto fallback
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** `?cameraTest=<label>` on the page URL, so the owner's phone tests can be told apart. */
export function cameraTestLabel(): string | undefined {
  try {
    const value = new URLSearchParams(window.location.search).get('cameraTest');
    return value ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Orientation, viewport and pixel ratio of the page. */
export function pageDiagnosticFields(): NonNullable<CameraDiagnostic['page']> | undefined {
  try {
    return {
      orientation: window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
  } catch {
    return undefined;
  }
}

/** Fire and forget. Uses sendBeacon, falls back to a keepalive fetch, never throws. */
export function sendCameraDiagnostic(diagnostic: CameraDiagnostic): void {
  try {
    if (typeof window === 'undefined') return;

    const body = JSON.stringify(diagnostic);
    if (body.length > DIAGNOSTIC_MAX_BYTES) return;

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(DIAGNOSTIC_ENDPOINT, new Blob([body], { type: 'application/json' }))
    ) {
      return;
    }

    void fetch(DIAGNOSTIC_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // diagnostics must never affect capture
  }
}
