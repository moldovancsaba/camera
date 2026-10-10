/**
 * The camera solution of an event (issue 547, owner answer 253): which of the two ways to take the photo the event uses.
 *  - `device`: the standard. A phone opens its own camera app (the camera's full still); a desktop webcam shows a live view (lib/camera/still-capture.ts).
 *  - `live`: the page's own live view with the portrait or landscape and wide or tight buttons (lib/camera/view.ts, issue 525), on every device.
 * The chain is the one every brick follows: the event's own choice, else its partner's, else `device`; nothing is copied down. `?views=1` on the address still forces `live`, for trying it. Pure; unit-tested (mode.test.ts).
 */

export const CAMERA_MODES = ['device', 'live'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];
export const DEFAULT_CAMERA_MODE: CameraMode = 'device';

export const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  device: "The phone's own camera app (standard)",
  live: 'The live camera with view buttons (portrait or landscape, wide or tight)',
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

export type ParsedCameraMode = { ok: true; value: CameraMode | null } | { ok: false; error: string };

/** A request value: a mode, or an empty value / null for "no choice at this level"; anything else is refused. */
export function parseCameraMode(input: unknown): ParsedCameraMode {
  if (input === null || input === '') return { ok: true, value: null };
  if (isCameraMode(input)) return { ok: true, value: input };
  return { ok: false, error: 'cameraMode must be one of: ' + CAMERA_MODES.join(', ') };
}
