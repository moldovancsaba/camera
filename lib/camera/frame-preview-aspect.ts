/**
 * Intrinsic width/height from a frame image URL — used for CameraCapture preview aspect
 * when DB `width`/`height` are wrong or legacy 1920×1080 defaults (same idea as FunFitFan's
 * explicit `previewAspectWidthOverHeight`).
 */
export function loadImageAspectRatio(imageUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0) {
        resolve(w / h);
      } else {
        reject(new Error('invalid image dimensions'));
      }
    };
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = imageUrl;
  });
}
