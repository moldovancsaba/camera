/**
 * The activity log as a CSV file (issue 517). A cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is written with a quote in front, so a spreadsheet never takes a
 * message for a formula; a cell with a comma, a quote or a line break is quoted. Pure, unit-tested in csv.test.ts.
 */

import type { ActivityRecord } from './log';

export const ACTIVITY_CSV_HEADER = ['at', 'who', 'user_id', 'role', 'method', 'path', 'status', 'outcome', 'message'] as const;

function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function activityCsv(records: readonly ActivityRecord[]): string {
  const rows = records.map((r) => [r.at, r.userEmail, r.userId, r.role, r.method, r.path, r.status, r.outcome, r.message].map(cell).join(','));
  return [ACTIVITY_CSV_HEADER.join(','), ...rows].join('\r\n') + '\r\n';
}
