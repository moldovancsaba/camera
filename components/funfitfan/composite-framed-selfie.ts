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
 * @param line1 Sport / activity (first line, top)
 * @param line2 "Feel so #tag, …" or empty (second line below)
 */
export async function compositeFramedSelfieWithText(
  selfieDataUrl: string,
  frameImageUrl: string,
  line1: string,
  line2: string
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

  const l1 = typeof line1 === 'string' ? line1.trim() : '';
  const l2 = typeof line2 === 'string' ? line2.trim() : '';

  if (l1 || l2) {
    const padX = Math.round(canvas.width * 0.04);
    const padY = Math.round(canvas.height * 0.028);
    const maxTextWidth = canvas.width - padX * 2;

    let fontSize = Math.min(Math.floor(canvas.height * 0.11), Math.floor(canvas.width * 0.08));
    const minFont = 10;
    const fontFamily = 'DynaPuff, cursive, system-ui, sans-serif';

    const setFont = (px: number) => {
      ctx.font = `700 ${px}px ${fontFamily}`;
    };

    setFont(fontSize);
    while (fontSize > minFont) {
      const w1 = l1 ? ctx.measureText(l1).width : 0;
      const w2 = l2 ? ctx.measureText(l2).width : 0;
      const tooWide = (l1 && w1 > maxTextWidth) || (l2 && w2 > maxTextWidth);
      if (!tooWide) break;
      fontSize -= 1;
      setFont(fontSize);
    }

    const x = canvas.width / 2;
    let y = padY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, Math.ceil(fontSize * 0.07));

    const drawLine = (text: string) => {
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x, y);
    };

    if (l1) {
      drawLine(l1);
    }
    if (l2) {
      const lineGap = Math.max(4, Math.round(fontSize * 0.2));
      const lineHeight = fontSize * 1.2;
      y += (l1 ? lineHeight + lineGap : 0);
      drawLine(l2);
    }
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}
