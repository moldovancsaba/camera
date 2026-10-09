/**
 * Anonymous slideshow diagnostics beacon (camera#476, step S1).
 *
 * The giant-screen player reports batches of small events (slides shown, playlist calls, image preloads, the refill lock, a heartbeat,
 * stalls, errors) so a freeze leaves evidence: did a photo repeat, was a request or the lock stuck, was the picture fetched late, did the
 * page stop painting. Public by design (the screen is not signed in). Size-bounded and allowlisted (lib/slideshow/diagnostics.ts); only
 * logged as a structured line, never persisted or reflected. A batch with a stall or an error is logged as a warning.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logInfo, logWarn } from '@/lib/observability/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rateLimiter';
import { SLIDESHOW_DIAGNOSTIC_MAX_BYTES, sanitizeSlideshowDiagnostic } from '@/lib/slideshow/diagnostics';

export const runtime = 'nodejs';

const MAX_USER_AGENT = 200;

export async function POST(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.DIAGNOSTICS);
  } catch {
    return new NextResponse(null, { status: 429 });
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > SLIDESHOW_DIAGNOSTIC_MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const text = await request.text().catch(() => '');
  if (!text || text.length > SLIDESHOW_DIAGNOSTIC_MAX_BYTES) {
    return new NextResponse(null, { status: text ? 413 : 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const batch = sanitizeSlideshowDiagnostic(parsed);
  if (!batch) {
    return new NextResponse(null, { status: 400 });
  }

  const trouble = batch.events.some((e) => e.type === 'stall' || e.type === 'error');
  (trouble ? logWarn : logInfo)('camera.slideshow_diagnostic', trouble ? 'stall or error' : 'batch', {
    batch,
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, MAX_USER_AGENT) || undefined,
  });

  return new NextResponse(null, { status: 204 });
}
