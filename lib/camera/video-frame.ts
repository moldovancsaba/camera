/**
 * Browser-side helpers for reading a live <video> frame (camera#206). DOM only, so it is not
 * unit-tested; the decisions live in capture-policy.ts.
 */

import { lumaStats, type LumaStats } from './capture-policy';

/** Samples are taken on a grid this wide and tall: cheap, and enough to tell flat from detailed. */
const SAMPLE_SIZE = 32;

/**
 * Resolves after the next video frame has been presented. Uses requestVideoFrameCallback
 * (Chrome 83, Firefox 132, Safari 15.4) and falls back to two animation frames; resolves
 * after `timeoutMs` regardless, so a stalled video cannot hang a capture.
 */
export function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 500): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);

    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(() => finish());
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => finish()));
    }
  });
}

/** Brightness statistics of the current video frame, or null when they cannot be read. */
export function sampleVideoLumaStats(video: HTMLVideoElement, sampleCanvas: HTMLCanvasElement): LumaStats | null {
  sampleCanvas.width = SAMPLE_SIZE;
  sampleCanvas.height = SAMPLE_SIZE;
  const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  try {
    ctx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    return lumaStats(ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
  } catch (error) {
    console.warn('Could not sample the video frame.', error);
    return null;
  }
}
