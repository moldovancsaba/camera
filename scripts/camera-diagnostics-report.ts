/**
 * Summarises the anonymous capture diagnostics (camera#204) per browser, device or test label.
 *
 * Usage: npm run camera:diagnostics-report -- [--by browser|device|testRun] [logfile]
 *   Reads the log lines from the file, or from stdin when no file is given. Feed it an export
 *   of the Vercel runtime logs (any lines containing "camera.capture_diagnostic" are used).
 */

import { readFileSync } from 'node:fs';
import { extractRecords, formatReport, summarize, type GroupBy } from '../lib/camera/diagnostics-report';

const args = process.argv.slice(2);
const byIndex = args.indexOf('--by');
const by = (byIndex >= 0 ? args[byIndex + 1] : 'browser') as GroupBy;
if (!['browser', 'device', 'testRun'].includes(by)) {
  console.error('--by must be browser, device or testRun');
  process.exit(1);
}

const fileArgs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--by');
const text = readFileSync(fileArgs[0] ?? 0, 'utf8');
const records = extractRecords(text.split('\n'));

if (!records.length) {
  console.error('No camera.capture_diagnostic records found in the input.');
  process.exit(1);
}

console.log(`${records.length} records, grouped by ${by}\n`);
console.log(formatReport(summarize(records, by)));
