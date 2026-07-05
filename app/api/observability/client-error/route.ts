/**
 * Client error beacon (GitHub #83).
 *
 * The global error boundary (`app/error.tsx`) is a client component, so its
 * `console.error` lands in the browser, never in server logs where alerting
 * lives. This endpoint accepts a small beacon from the boundary and re-emits it
 * as a structured server-side error record, so client/RSC render crashes — keyed
 * by the digest the user sees — become queryable and alertable alongside API
 * errors.
 *
 * In production, Next.js only exposes the `digest` to the client boundary
 * (message/stack are stripped); the digest correlates with the full stack that
 * Next already logs server-side, so recording digest + route + timestamp is
 * enough to connect a user report to the underlying server log.
 *
 * Public by design (unauthenticated users can hit an error page). Payload is
 * size-bounded and only ever logged, never persisted or reflected.
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportServerError } from '@/lib/observability/logger';

export const runtime = 'nodejs';

const MAX_FIELD = 2048;

function clamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_FIELD);
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    digest?: unknown;
    message?: unknown;
    url?: unknown;
  };

  const digest = clamp(payload.digest);
  const message = clamp(payload.message) ?? 'Client error boundary triggered';
  const url = clamp(payload.url);

  // Build an Error so the digest is carried on the structured record.
  const error = Object.assign(new Error(message), digest ? { digest } : {});
  reportServerError('client.error_boundary', error, {
    url,
    userAgent: clamp(request.headers.get('user-agent')),
  });

  return NextResponse.json({ ok: true });
}
