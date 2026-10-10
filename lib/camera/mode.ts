/**
 * The camera solution of an event (issue 547, owner answers 253 and 272): which way the photo page takes the photo, chosen by the admin for a partner and for an event.
 *  - `device`: automatic, the standard. A phone opens its own camera app (the camera's full still); a computer shows a live view (lib/camera/still-capture.ts).
 *  - `live`: the page's own live view with the portrait or landscape and wide or tight buttons (lib/camera/view.ts, issue 525), on every device.
 *  - `still`: the live view on every device, the shutter takes the sensor's own photo where the browser can (`ImageCapture.takePhoto`), else the picture on the screen; no view buttons.
 *  - `frame`: the live view on every device, the shutter keeps the picture on the screen, the older way and the way back; no view buttons.
 * The chain is the one every brick follows: the event's own choice, else its partner's, else `device`; nothing is copied down. `?views=1` and `?capture=system|still|frame` on the capture address still win over the
 * setting, for trying a way on one phone. Pure; unit-tested (mode.test.ts).
 */

import type { CaptureMethod } from '@/lib/camera/still-capture';

export const CAMERA_MODES = ['device', 'live', 'still', 'frame'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];
export const DEFAULT_CAMERA_MODE: CameraMode = 'device';

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  device: "Automatic: the phone's own camera app on phones, the live camera on computers (standard)",
  live: 'The live camera with view buttons (portrait or landscape, wide or tight)',
  still: "The live camera, a real photo from the camera's sensor (no view buttons)",
  frame: 'The live camera, the picture as shown on the screen (no view buttons; the older way)',
};

export function isCameraMode(value: unknown): value is CameraMode {
  return typeof value === 'string' && (CAMERA_MODES as readonly string[]).includes(value);
}

/** What an event uses: its own choice, else its partner's, else the standard. A stored value we do not know counts as no choice. */
export function effectiveCameraMode(event: { cameraMode?: unknown } | null | undefined, partner?: { cameraMode?: unknown } | null): CameraMode {
  if (isCameraMode(event?.cameraMode)) return event.cameraMode;
  if (isCameraMode(partner?.cameraMode)) return partner.cameraMode;
  return DEFAULT_CAMERA_MODE;
}

/**
 * What a mode asks of the capture page: whether the view buttons are on and which way to take the photo is forced (`null` = the automatic choice of `chooseCaptureMethod`).
 * `chooseCaptureMethod` gets these as its `views` and `override`; the address' own `?views=1` and `?capture=` are applied over them by the page.
 */
export function captureSettingsOf(mode: CameraMode | null | undefined): { views: boolean; override: CaptureMethod | null } {
  if (mode === 'live') return { views: true, override: null };
  if (mode === 'still') return { views: false, override: 'still' };
  if (mode === 'frame') return { views: false, override: 'frame' };
  return { views: false, override: null };
}

export type ParsedCameraMode = { ok: true; value: CameraMode | null } | { ok: false; error: string };

/** A request value: a mode, or an empty value / null for "no choice at this level"; anything else is refused. */
export function parseCameraMode(input: unknown): ParsedCameraMode {
  if (input === null || input === '') return { ok: true, value: null };
  if (isCameraMode(input)) return { ok: true, value: input };
  return { ok: false, error: 'cameraMode must be one of: ' + CAMERA_MODES.join(', ') };
}
