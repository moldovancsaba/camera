import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { blockDangerousApiInProduction } from '@/lib/api/production-guard';
import { assertDisposableE2EDatabase } from '@/lib/e2e/safety';

const E2E_PARTNER_ID = 'e2e-partner';
const E2E_SOURCE = 'system:e2e-bootstrap';

function normalizeRunId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildCleanupFilter(runId: string | null) {
  const sourceScoped = { 'metadata.source': E2E_SOURCE };
  const legacyScoped = { createdBy: 'system:e2e' };
  if (!runId) {
    return { $or: [sourceScoped, legacyScoped] };
  }
  return { 'metadata.e2eRunId': runId };
}

export async function POST(request: Request) {
  const blocked = blockDangerousApiInProduction();
  if (blocked) {
    return blocked;
  }

  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.local');
  if (!isLocalHost && process.env.ALLOW_DANGEROUS_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    assertDisposableE2EDatabase('E2E cleanup');
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { e2eRunId?: unknown };
  const e2eRunId = normalizeRunId(payload.e2eRunId);
  const db = await connectToDatabase();
  const cleanupFilter = buildCleanupFilter(e2eRunId);
  const eventCleanupFilter = { partnerId: E2E_PARTNER_ID, ...cleanupFilter };

  const partnersResult = await db
    .collection(COLLECTIONS.PARTNERS)
    .deleteOne({ partnerId: E2E_PARTNER_ID, ...cleanupFilter });

  const eventsResult = await db
    .collection(COLLECTIONS.EVENTS)
    .deleteMany(eventCleanupFilter);

  const partnerAccessResult = await db
    .collection(COLLECTIONS.PARTNER_USER_ACCESS)
    .deleteMany({
      partnerId: E2E_PARTNER_ID,
      ...cleanupFilter,
    });

  const submissionsResult = await db
    .collection(COLLECTIONS.SUBMISSIONS)
    .deleteMany({ partnerId: E2E_PARTNER_ID, ...cleanupFilter });

  const slideshowsResult = await db
    .collection(COLLECTIONS.SLIDESHOWS)
    .deleteMany({ ...cleanupFilter });

  const tryOnJobsResult = await db
    .collection(COLLECTIONS.TRYON_JOBS)
    .deleteMany({ ...cleanupFilter });

  const moderationEventsResult = await db
    .collection(COLLECTIONS.TRYON_MODERATION_EVENTS)
    .deleteMany({ ...cleanupFilter });

  return NextResponse.json({
    ok: true,
    e2eRunId,
    deleted: {
      partners: partnersResult.deletedCount,
      events: eventsResult.deletedCount,
      partnerUserAccess: partnerAccessResult.deletedCount,
      submissions: submissionsResult.deletedCount,
      slideshows: slideshowsResult.deletedCount,
      tryOnJobs: tryOnJobsResult.deletedCount,
      tryOnModerationEvents: moderationEventsResult.deletedCount,
    },
  });
}
