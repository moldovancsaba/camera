import { TEMPORARY_CAPTURE_PREFIX, validateTemporaryCapturePathname } from '@/lib/submissions/original-image';

export const captureResumeDraftKey = (eventId: string) => `camera:capture-resume:${eventId}`;

export function forgetCaptureResumeDraft(storage: Pick<Storage, 'removeItem'> | null | undefined, eventId: string): void {
  try {
    storage?.removeItem(captureResumeDraftKey(eventId));
  } catch {
    // A completed submission must not fail because session storage is unavailable.
  }
}

export interface CaptureResumeDraft {
  version: 1;
  eventId: string;
  originalUrl: string;
  framedUrl: string;
  capture: {
    width: number;
    height: number;
    facingMode: 'user' | 'environment';
    mirrored: boolean;
    method?: 'still' | 'system' | 'frame';
    nativeWidth?: number;
    nativeHeight?: number;
  };
  selectedFrame: unknown;
  choice: unknown;
  galleryTick: boolean;
};

function validTemporaryCaptureUrl(value: unknown, eventId: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)) return false;
    if (url.username || url.password || url.search || url.hash) return false;
    const pathname = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return pathname.startsWith(`${TEMPORARY_CAPTURE_PREFIX}${eventId}/`) && validateTemporaryCapturePathname(pathname, eventId);
  } catch {
    return false;
  }
}

export function parseCaptureResumeDraft(value: string | null, eventId: string): CaptureResumeDraft | null {
  if (!value) return null;
  try {
    const draft = JSON.parse(value) as Partial<CaptureResumeDraft>;
    if (draft.version !== 1 || draft.eventId !== eventId) return null;
    if (!validTemporaryCaptureUrl(draft.originalUrl, eventId) || !validTemporaryCaptureUrl(draft.framedUrl, eventId)) return null;
    if (new URL(draft.originalUrl).host !== new URL(draft.framedUrl).host) return null;
    const capture = draft.capture;
    if (!capture || !Number.isInteger(capture.width) || !Number.isInteger(capture.height) || capture.width < 1 || capture.height < 1) return null;
    if (capture.facingMode !== 'user' && capture.facingMode !== 'environment') return null;
    if (typeof capture.mirrored !== 'boolean' || typeof draft.galleryTick !== 'boolean') return null;
    if ((draft.selectedFrame !== null && typeof draft.selectedFrame !== 'object') || !draft.choice || typeof draft.choice !== 'object') return null;
    return draft as CaptureResumeDraft;
  } catch {
    return null;
  }
}
