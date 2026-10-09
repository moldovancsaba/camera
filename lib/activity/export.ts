/**
 * The weekly archive of the activity log (issue 517; owner: "weekly send it as csv to moldovancsaba@gmail.com so we have archived, and keep for a week then delete when the next you send
 * out"). Each run mails everything written since the previous export as one CSV attachment, writes a row in `activity_exports` for it, and only then deletes the rows the **previous**
 * export carried: so a record is mailed before it is ever deleted, and is kept one to two weeks. If the mail cannot be sent nothing is written or deleted and the next run covers the same
 * period again. Dependencies are injected so it is unit-tested without a database or a mail service (export.test.ts).
 */

import type { Db } from 'mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import type { SendEmailInput, SendEmailResult } from '@/lib/email/send';
import { activityCsv } from './csv';
import type { ActivityRecord } from './log';

export const ACTIVITY_EXPORT_DEFAULT_TO = 'moldovancsaba@gmail.com';
/** Rows in one mail; a bigger period is sent in parts, the rest goes with the next export. */
export const ACTIVITY_EXPORT_MAX_ROWS = 50_000;

export interface ExportDeps {
  send: (input: SendEmailInput) => Promise<SendEmailResult>;
  now: () => Date;
  to: string;
}

export type ExportResult = { ok: true; rows: number; fromAt: string | null; toAt: string; deleted: number } | { ok: false; error: string };

export async function exportActivity(db: Db, deps: ExportDeps): Promise<ExportResult> {
  const exports = db.collection(COLLECTIONS.ACTIVITY_EXPORTS);
  const log = db.collection(COLLECTIONS.ACTIVITY_LOG);
  const last = await exports.findOne({}, { sort: { toAt: -1 } });
  const fromAt = typeof last?.toAt === 'string' ? last.toAt : null;
  const until = deps.now().toISOString();

  const rows = (await log
    .find({ at: { ...(fromAt ? { $gt: fromAt } : {}), $lte: until } })
    .sort({ at: 1 })
    .limit(ACTIVITY_EXPORT_MAX_ROWS)
    .toArray()) as unknown as ActivityRecord[];
  // A full part ends where its last row ends; the rest of the period is the next export's.
  const toAt = rows.length === ACTIVITY_EXPORT_MAX_ROWS ? rows[rows.length - 1].at : until;

  const counts = { ok: 0, refused: 0, error: 0 };
  for (const row of rows) counts[row.outcome] += 1;
  const range = `${fromAt ? fromAt.slice(0, 10) : 'the start'} to ${toAt.slice(0, 10)}`;
  const text = [
    `Camera activity log, ${range}.`,
    `${rows.length} records: ${counts.ok} actions by the people who manage the service, ${counts.refused} refused requests, ${counts.error} failed requests.`,
    'The attached CSV has: when, who, role, method, path, status, outcome and, for a failure, the reason.',
    'The records of the period before this one are deleted from the system now that this one has been sent; this file is the archive.',
  ].join('\n\n');

  const sent = await deps.send({
    to: deps.to,
    subject: `Camera activity log ${range}: ${rows.length} records`,
    html: text.split('\n\n').map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join(''),
    text,
    attachments: [{ filename: `camera-activity-${toAt.slice(0, 10)}.csv`, content: Buffer.from(activityCsv(rows), 'utf8') }],
  });
  if (!sent.sent) return { ok: false, error: sent.error };

  await exports.insertOne({ sentAt: deps.now().toISOString(), fromAt, toAt, rows: rows.length, to: deps.to });
  // Only now, with this period safely mailed, are the records of the previous period deleted.
  const deleted = last && typeof last.toAt === 'string' ? (await log.deleteMany({ at: { $lte: last.toAt } })).deletedCount : 0;
  return { ok: true, rows: rows.length, fromAt, toAt, deleted };
}
