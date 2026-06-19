/**
 * Event Emails Export
 *
 * GET /api/admin/events/[id]/export/emails
 * Downloads a deduplicated CSV of every email address collected against an event
 * (from SSO accounts and the guest onboarding form).
 *
 * Access: partner-scoped Events manager (or global admin). Returns 403 otherwise,
 * 404 when the event does not exist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db/mongodb';
import { withErrorHandler, requireAuth, apiNotFound } from '@/lib/api';
import { assertPartnerEventAccess } from '@/lib/partners/authorization';
import {
  loadEventForExport,
  collectEventSubmissionsForExport,
  buildEmailRows,
  toCsv,
  exportSlug,
} from '@/lib/events/event-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await requireAuth(request);
  const { id } = await context.params;

  const db = await connectToDatabase();
  const event = await loadEventForExport(db, id);
  if (!event) {
    throw apiNotFound('Event not found');
  }
  // Bulk PII export is a manage-level action: throws 403 below manager access
  // (global admins are auto-allowed).
  await assertPartnerEventAccess(db, session, id, 'manager');

  const submissions = await collectEventSubmissionsForExport(db, event.eventId);
  const rows = buildEmailRows(submissions);

  const csv = toCsv(
    ['email', 'name', 'source', 'submissions', 'first_submitted_at', 'last_submitted_at'],
    rows.map((row) => [
      row.email,
      row.name,
      row.source,
      row.submissionCount,
      row.firstSubmittedAt,
      row.lastSubmittedAt,
    ])
  );

  const date = new Date().toISOString().slice(0, 10);
  const filename = `event-${exportSlug(event.name)}-emails-${date}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
