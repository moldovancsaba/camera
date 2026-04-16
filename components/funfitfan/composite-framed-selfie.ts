/**
 * Client-only: build FunFitFan share image = selfie + frame PNG + text (canvas).
 * Call only from browser (e.g. after getUserMedia capture).
 */

const DYNAPUFF_CSS =
  'https://fonts.googleapis.com/css2?family=DynaPuff:wght@400;600;700&display=swap';

let dynaPuffLoadPromise: Promise<void> | null = null;

async function ensureDynaPuffLoaded(): Promise<void> {
  if (typeof document === 'undefined') return;
  if (dynaPuffLoadPromise) return dynaPuffLoadPromise;

  dynaPuffLoadPromise = (async () => {
    const id = 'fff-dynapuff-font';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = DYNAPUFF_CSS;
      document.head.appendChild(link);
    }
    await document.fonts.ready;
    try {
      await document.fonts.load('700 96px DynaPuff');
      await document.fonts.load('600 64px DynaPuff');
    } catch {
      /* continue with fallback metrics */
    }
  })();

  return dynaPuffLoadPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * @param selfieDataUrl camera result (e.g. image/jpeg from canvas / getUserMedia)
 * @param frameImageUrl frame asset URL (imgbb, same-origin or CORS-enabled)
 * @param lines first line usually activity (e.g. "Running"), second result text — rendered as one centered line
 */
export async function compositeFramedSelfieWithText(
  selfieDataUrl: string,
  frameImageUrl: string,
  lines: string[]
): Promise<string> {
  await ensureDynaPuffLoaded();

  const [photoImg, frameImg] = await Promise.all([loadImage(selfieDataUrl), loadImage(frameImageUrl)]);

  const maxDimension = 2048;
  let targetWidth = frameImg.width;
  let targetHeight = frameImg.height;
  if (targetWidth > maxDimension || targetHeight > maxDimension) {
    const scale = Math.min(maxDimension / targetWidth, maxDimension / targetHeight);
    targetWidth = Math.floor(targetWidth * scale);
    targetHeight = Math.floor(targetHeight * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');

  ctx.drawImage(photoImg, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

  const parts = lines.map((l) => (typeof l === 'string' ? l.trim() : '')).filter(Boolean);
  const text = parts.join(' \u2014 ');

  if (text) {
    const padX = Math.round(canvas.width * 0.04);
    const padY = Math.round(canvas.height * 0.028);
    const maxTextWidth = canvas.width - padX * 2;

    let fontSize = Math.min(Math.floor(canvas.height * 0.13), Math.floor(canvas.width * 0.09));
    const minFont = 10;
    const fontFamily = 'DynaPuff, cursive, system-ui, sans-serif';

    const setFont = (px: number) => {
      ctx.font = `700 ${px}px ${fontFamily}`;
    };

    setFont(fontSize);
    while (fontSize > minFont && ctx.measureText(text).width > maxTextWidth) {
      fontSize -= 1;
      setFont(fontSize);
    }

    const x = canvas.width / 2;
    const y = padY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, Math.ceil(fontSize * 0.07));
    ctx.strokeText(text, x, y);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}
