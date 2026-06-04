import { loadEnvFromFiles } from './load-env-from-files';
import { closeConnection, connectToDatabase } from '@/lib/db/mongodb';
import { dispatchPendingSubmissionEmailForSubmission } from '@/lib/email/submission-result-email';
import { COLLECTIONS, type Submission } from '@/lib/db/schemas';

interface SendTodayOptions {
  dateLabel: string;
  startIso: string;
  endIso: string;
  force: boolean;
  dryRun: boolean;
  limit: number | null;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateLabel(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function buildDateRange(year: number, month: number, day: number): { dateLabel: string; startIso: string; endIso: string } {
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    throw new Error(`Invalid date: ${year}-${pad2(month)}-${pad2(day)}`);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    dateLabel: formatDateLabel(start),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function parseDateArg(args: string[]): { dateLabel: string; startIso: string; endIso: string } {
  const dateArg = args.find((value) => value.startsWith('--date='));
  if (!dateArg) {
    const now = new Date();
    return buildDateRange(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  const value = dateArg.replace('--date=', '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Invalid --date format. Use YYYY-MM-DD, e.g. --date=2026-06-04');
  }
  return buildDateRange(
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10),
  );
}

function parseLimitArg(args: string[]): number | null {
  const limitArg = args.find((value) => value.startsWith('--limit='));
  if (!limitArg) return null;

  const parsed = Number.parseInt(limitArg.replace('--limit=', '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeMetadataPatch(metadataPatch: Record<string, unknown>): Record<string, unknown> {
  return Object.entries(metadataPatch).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function parseArgs(): SendTodayOptions {
  const args = process.argv.slice(2);
  const { dateLabel, startIso, endIso } = parseDateArg(args);
  return {
    dateLabel,
    startIso,
    endIso,
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    limit: parseLimitArg(args),
  };
}

async function applyMetadataPatch(
  db: Awaited<ReturnType<typeof connectToDatabase>>,
  submissionId: unknown,
  metadataPatch: Record<string, unknown>
) {
  const sanitized = sanitizeMetadataPatch(metadataPatch);
  if (!submissionId || Object.keys(sanitized).length === 0) return;

  await db.collection<Submission>(COLLECTIONS.SUBMISSIONS).updateOne(
    { _id: submissionId },
    { $set: sanitized }
  );
}

async function runForDate(db: Awaited<ReturnType<typeof connectToDatabase>>, options: SendTodayOptions) {
  const baseQuery: Record<string, unknown> = {
    submissionKind: { $ne: 'tryon_result' },
    createdAt: {
      $gte: options.startIso,
      $lt: options.endIso,
    },
  };

  if (!options.force) {
    baseQuery['metadata.emailSent'] = { $ne: true };
  }

  let cursor = db.collection<Submission>(COLLECTIONS.SUBMISSIONS)
    .find(baseQuery)
    .sort({ createdAt: 1 });

  if (options.limit) {
    cursor = cursor.limit(options.limit);
  }

  let scanned = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let retry = 0;
  let patched = 0;

  for await (const submission of cursor) {
    scanned += 1;
    const submissionId = submission._id?.toString();

    if (options.dryRun) {
      console.log(`[DRY] ${submissionId || '<unknown>'} -> would process`);
      continue;
    }

    try {
      const submissionForDispatch = options.force
        ? {
            ...submission,
            metadata: {
              ...(submission.metadata || {}),
              emailSent: false,
              emailSentAfterSave: false,
              emailSentAfterRelatedPhotos: false,
              emailSendAfterRelatedPending: false,
            },
          }
        : submission;

      const result = await dispatchPendingSubmissionEmailForSubmission(db, submissionForDispatch);
      if (!result) {
        skipped += 1;
        continue;
      }

      if (result.sent) {
        sent += 1;
      }

      if (result.shouldRetry) {
        retry += 1;
      }

      if (result.metadataPatch) {
        await applyMetadataPatch(db, submission._id, result.metadataPatch);
        patched += 1;
      }

      if (!result.sent && !result.shouldRetry) {
        skipped += 1;
      }
    } catch (error: unknown) {
      failed += 1;
      console.error(
        `❌ Failed ${submissionId || '<unknown>'}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log(`\nSummary for ${options.dateLabel}`);
  console.log(`  scanned: ${scanned}`);
  console.log(`  sent: ${sent}`);
  console.log(`  patched: ${patched}`);
  console.log(`  skipped: ${skipped}`);
  console.log(`  retry: ${retry}`);
  console.log(`  failed: ${failed}`);
  console.log(`  dryRun: ${options.dryRun ? 'yes' : 'no'}`);
  console.log(`  force: ${options.force ? 'yes' : 'no'}`);
}

async function main() {
  loadEnvFromFiles();
  const options = parseArgs();
  const db = await connectToDatabase();

  try {
    console.log(`📧 Sending submission emails for ${options.dateLabel}`);
    await runForDate(db, options);
  } finally {
    await closeConnection();
  }
}

main().catch(async (error: unknown) => {
  console.error('Failed to send today submission emails:', error);
  await closeConnection().catch(() => {});
  process.exitCode = 1;
});
