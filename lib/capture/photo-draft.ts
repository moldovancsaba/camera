/** The uploaded photo and page position kept across a same-tab SSO round trip. */
export interface CapturePhotoDraft {
  eventId: string;
  originalUrl: string;
  cropUrl: string;
  capture: {
    width: number;
    height: number;
    facingMode: 'user' | 'environment';
    mirrored: boolean;
    method?: 'still' | 'system' | 'frame';
    nativeWidth?: number;
    nativeHeight?: number;
  };
  frameId: string | null;
  generatedFrame?: { index: number | null; message: string | null; imageUrl: string; width: number; height: number };
  galleryTick: boolean;
  croppedWidth: number;
  croppedHeight: number;
  savedAt: number;
}

const key = (eventId: string) => `camera.photo-draft.${eventId}`;

export function rememberPhotoDraft(storage: Pick<Storage, 'setItem'> | null | undefined, draft: CapturePhotoDraft): void {
  try {
    storage?.setItem(key(draft.eventId), JSON.stringify(draft));
  } catch {
    // The photo itself lives on the server; private or full browser storage must not break capture.
  }
}

export function recallPhotoDraft(storage: Pick<Storage, 'getItem'> | null | undefined, eventId: string, now = Date.now()): CapturePhotoDraft | null {
  try {
    const raw = storage?.getItem(key(eventId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CapturePhotoDraft>;
    if (value.eventId !== eventId || typeof value.originalUrl !== 'string' || typeof value.cropUrl !== 'string') return null;
    if (typeof value.savedAt !== 'number' || now - value.savedAt > 30 * 60 * 1000 || now < value.savedAt) return null;
    if (!value.capture || !Number.isFinite(value.capture.width) || !Number.isFinite(value.capture.height)) return null;
    if (!Number.isFinite(value.croppedWidth) || !Number.isFinite(value.croppedHeight)) return null;
    return value as CapturePhotoDraft;
  } catch {
    return null;
  }
}

export function forgetPhotoDraft(storage: Pick<Storage, 'removeItem'> | null | undefined, eventId: string): void {
  try {
    storage?.removeItem(key(eventId));
  } catch {
    // A blocked sessionStorage must not interrupt the flow.
  }
}
