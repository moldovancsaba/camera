/**
 * Client-only: build FunFitFan share image = selfie + frame PNG + text lines (canvas).
 * Call only from browser (e.g. after getUserMedia capture).
 */

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
 * @param lines first line usually activity (e.g. "Running"), second result text
 */
export async function compositeFramedSelfieWithText(
  selfieDataUrl: string,
  frameImageUrl: string,
  lines: string[]
): Promise<string> {
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

  const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.04);
  const barH = Math.round(canvas.height * 0.22);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, canvas.height - barH, canvas.width, barH);

  const primary = (lines[0] || '').trim();
  const secondary = (lines[1] || '').trim();
  const titlePx = Math.max(18, Math.round(canvas.width * 0.045));
  const bodyPx = Math.max(14, Math.round(canvas.width * 0.032));
  const fontTitle = `600 ${titlePx}px system-ui, -apple-system, sans-serif`;
  const fontBody = `400 ${bodyPx}px system-ui, -apple-system, sans-serif`;

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  let y = canvas.height - barH + pad;
  if (primary) {
    ctx.font = fontTitle;
    ctx.fillText(primary, pad, y);
    y += Math.round(titlePx * 1.35);
  }
  if (secondary) {
    ctx.font = fontBody;
    const words = secondary.split(/\s+/);
    let line = '';
    const maxW = canvas.width - pad * 2;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, pad, y);
        y += Math.round(bodyPx * 1.25);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, pad, y);
  }

  return canvas.toDataURL('image/jpeg', 0.88);
}
