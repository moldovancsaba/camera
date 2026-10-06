/**
 * Anonymous capture diagnostics beacon (camera#204).
 *
 * The capture screen reports how a capture went (requested and granted camera mode, time to
 * first frame, time to shutter, retries, brightness statistics of the result) so the rate of
 * black or near-black photos can be compared per device and browser. Public by design (fans
 * are not signed in). Payload is size-bounded and allowlisted (lib/camera/diagnostics.ts); the
 * record is only logged as a structured line, never persisted or reflected. No image, name,
 * email, IP address or stable device identifier is ever part of it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logInfo } from '@/lib/observability/logger';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rateLimiter';
import { DIAGNOSTIC_MAX_BYTES, sanitizeDiagnostic } from '@/lib/camera/diagnostics';

export const runtime = 'nodejs';

const MAX_USER_AGENT = 200;

export async function POST(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.DIAGNOSTICS);
  } catch {
    return new NextResponse(null, { status: 429 });
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > DIAGNOSTIC_MAX_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const text = await request.text().catch(() => '');
  if (!text || text.length > DIAGNOSTIC_MAX_BYTES) {
    return new NextResponse(null, { status: text ? 413 : 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const diagnostic = sanitizeDiagnostic(parsed);
  if (!diagnostic) {
    return new NextResponse(null, { status: 400 });
  }

  logInfo('camera.capture_diagnostic', diagnostic.kind, {
    diagnostic,
    userAgent: (request.headers.get('user-agent') ?? '').slice(0, MAX_USER_AGENT) || undefined,
  });

  return new NextResponse(null, { status: 204 });
}
