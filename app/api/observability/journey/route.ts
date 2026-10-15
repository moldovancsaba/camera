/**
 * The anonymous journey beacon (issue 521, phase 2; docs/JOURNEY_RECORDING.md; owner decision 241).
 *
 * POST /api/observability/journey   { v: 1, s: <visit id>, e: <event>, ev: [[name, key | null, ms], ...] }  ->  204
 *
 * The capture page sends one small batch at each step change (lib/journey/client.ts), fire and forget. **This route never makes the page wait and writes nothing about a person**:
 *
 * - it answers 204 before anything is written (the write runs after the answer, lib/api/run-after-response.ts), so a slow or broken database cannot slow a beacon, let alone the page;
 * - it is rate limited, takes at most 4 KB, and keeps only what the vocabulary (lib/journey/events.ts) allows: a name from a fixed list with a key from that name's fixed list, and a time.
 *   Anything else, and any name the browser may not send, is dropped; a batch with nothing valid answers 400, which the page ignores;
 * - the IP address, the user agent, cookies and headers are **not read into any record**. The user agent is looked at once, to name the kind of device in one word (`ios`, `android`,
 *   `desktop`, `unknown`), and is not kept;
 * - the kill switch (lib/journey/setting.ts) is checked after the answer: while the recording is off the answer is the same 204 and nothing is written;
 * - a beacon for an event that does not exist is dropped after the answer, so the counts cannot be filled with made-up events.
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rateLimiter';
import { runAfterResponse } from '@/lib/api/run-after-response';
import { deviceClassOf } from '@/lib/analytics/facts';
import { connectToDatabase } from '@/lib/db/mongodb';
import { JOURNEY_MAX_BYTES, parseJourneyBatch } from '@/lib/journey/events';
import { storeJourneyBatch } from '@/lib/journey/store';
import { logWarn } from '@/lib/observability/logger';
import { COLLECTIONS } from '@/lib/db/schemas';
import { requestCounterSync, syncedEventOf } from '@/lib/analytics/counters-trigger';
import { resolveJourneyEvent } from '@/lib/journey/store';

export const runtime = 'nodejs';

const answer = (status: number) => new NextResponse(null, { status });

export async function POST(request: NextRequest) {
  try {
    await checkRateLimit(request, RATE_LIMITS.JOURNEY);
  } catch {
    return answer(429);
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > JOURNEY_MAX_BYTES) return answer(413);

  const text = await request.text().catch(() => '');
  if (!text) return answer(400);
  if (text.length > JOURNEY_MAX_BYTES) return answer(413);

  const batch = parseJourneyBatch(text);
  if (!batch) return answer(400);

  // The one thing read from the request headers: the kind of device, as one word. The user agent is not kept.
  const device = deviceClassOf(request.headers.get('user-agent'));

  runAfterResponse(async () => {
    try {
      const db = await connectToDatabase();
      const outcome = await storeJourneyBatch(db, batch, device);
      if (outcome !== 'written') return;
      const eventId = await resolveJourneyEvent(db, batch.event);
      if (!eventId) return;
      const event = await db.collection(COLLECTIONS.EVENTS).findOne({ eventId }, { projection: { _id: 1, eventId: 1, messmassEventId: 1, partnerId: 1 } });
      const synced = syncedEventOf(event);
      if (synced) await requestCounterSync(db, synced);
    } catch (error) {
      logWarn('journey.beacon_failed', 'A journey beacon could not be stored', { error: error instanceof Error ? error.message : String(error) });
    }
  });
  return answer(204);
}
