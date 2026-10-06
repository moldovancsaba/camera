/**
 * The frame of an event as a 50% black silhouette (camera#265, docs/PHOTO_VETTING_PLAN.md): the shape of the frame's non-transparent parts,
 * drawn instead of the real frame while a photo of a vetted event waits for approval, so the guest sees roughly where things go
 * without the brand's frame ever being put on an unapproved photo. Browser only (canvas); null when the image cannot be read.
 */

import { FRAME_TERRITORY_FILL } from '@/lib/gds/tokens/colors';

const MAX_SIDE = 1024;

export async function frameSilhouette(frameUrl: string): Promise<string | null> {
  try {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('frame image did not load'));
      image.src = frameUrl;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // source-in keeps the fill only where the frame has pixels, scaled by their opacity.
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = FRAME_TERRITORY_FILL;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
