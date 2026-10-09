/**
 * The daily check of every picture (issue 514, CLAUDE.md section 9): finds photos and other pictures (logos, frames, page pictures, e-mail pictures) that their host no longer has, so they are hidden
 * without anybody pressing a button. Called by the daily cron of vercel.json with Vercel's `Authorization: Bearer <CRON_SECRET>`; fails closed (403) when CRON_SECRET is not set on the project (the
 * owner's step, RUNBOOK). It works in bounded batches until its time is used, and the next day continues with what is still due (a picture is asked again after a week). The admin card "Broken
 * pictures" on the Slideshows page does the same by hand (/api/admin/media-health). Nothing is deleted.
 */

import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { apiForbidden, apiSuccess, withErrorHandler } from '@/lib/api';
import { connectToDatabase } from '@/lib/db/mongodb';
import { scanBatch } from '@/lib/media/broken';
import { scanPictures } from '@/lib/media/pictures';
import { checkSharedSecret, logSharedSecretRejection } from '@/lib/security/safeEqual';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Stop starting batches after this long, so the last one ends inside the function's 60 seconds. */
const BUDGET_MS = 40_000;

export const GET = withErrorHandler(async (request: NextRequest) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  const check = checkSharedSecret(process.env.CRON_SECRET?.trim(), token);
  if (check !== 'ok') {
    if (check === 'not_configured') console.warn('[internal-auth] pictures scan cron: CRON_SECRET is not configured; the daily check stays disabled (fail closed)');
    else logSharedSecretRejection('pictures scan cron', 'CRON_SECRET', check);
    throw apiForbidden();
  }
  const db = await connectToDatabase();
  const started = Date.now();
  const photos = { processed: 0, marked: 0, cleared: 0, remaining: 0 };
  let after: string | null = null;
  while (Date.now() - started < BUDGET_MS) {
    const batch = await scanBatch(db, { after: after ? new ObjectId(after) : undefined });
    photos.processed += batch.processed;
    photos.marked += batch.counts.marked ?? 0;
    photos.cleared += batch.counts.cleared ?? 0;
    photos.remaining = batch.remaining;
    if (!batch.next) break;
    after = batch.next;
  }
  const items = { processed: 0, broken: 0, cleared: 0, unknown: 0, remaining: 0 };
  while (Date.now() - started < BUDGET_MS) {
    const batch = await scanPictures(db);
    items.processed += batch.processed;
    items.broken += batch.broken;
    items.cleared += batch.cleared;
    items.unknown += batch.unknown;
    items.remaining = batch.remaining;
    if (batch.remaining === 0) break;
  }
  return apiSuccess({ photos, items });
});
