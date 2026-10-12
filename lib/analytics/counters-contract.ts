/**
 * The contract of the counters for messmass (issue 628, shared with the receiving route of messmass): what a push may hold, and the one function that enforces it. Both the builder of the
 * counters and the sender (lib/messmassClient.ts) run a payload through it, so a name that breaks the contract can never leave camera.
 *
 * The rules: every name is `camera_` plus lower case letters, digits and underscores (`COUNTER_NAME_PATTERN`: messmass holds variables of other sources, so camera's names must never meet
 * them); at most 300 names; a total is a whole number from 0 to 1,000,000,000 (a running total of the event, never a day's change); an average is a finite number sent whole; a label is
 * readable text of at most 80 characters. Pure apart from one log line per drop; unit-tested in counters.test.ts.
 */

import { logWarn } from '@/lib/observability/logger';
import { COUNTER_NAME_PATTERN } from '@/lib/photo-vetting/vocabulary';

export const MAX_COUNTERS = 300;
export const MAX_COUNTER_LABEL = 80;
export const MAX_COUNTER_TOTAL = 1_000_000_000;

/** The body of a push: totals and averages by name, and the readable label of each name. */
export interface CounterPayload {
  totals: Record<string, number>;
  averages: Record<string, number>;
  labels: Record<string, string>;
}

/** A payload as it may arrive from a stored value or a caller that did not check it. */
type LooseMap = Record<string, unknown> | null | undefined;

const entriesOf = (map: LooseMap): Array<[string, unknown]> => (map && typeof map === 'object' && !Array.isArray(map) ? Object.entries(map) : []);

/**
 * The payload with everything that breaks the contract left out, and each drop logged (the name only, never a number). A name that does not match the pattern, a value that is not a finite
 * number, a name past the 300th and a name seen twice are dropped; a total is rounded to a whole number inside its range; a label is trimmed and cut to 80 characters, and a label whose name
 * was dropped goes with it. The order of the names is kept, so the fixed counters come before the ones made from the lists and survive the cap.
 */
export function cleanCounterPayload(payload: { totals?: LooseMap; averages?: LooseMap; labels?: LooseMap } | null | undefined): CounterPayload {
  const totals: Record<string, number> = {};
  const averages: Record<string, number> = {};
  const labels: Record<string, string> = {};
  const kept = new Set<string>();
  const dropped: Array<{ name: string; why: string }> = [];

  const keep = (name: string, value: unknown, kind: 'total' | 'average'): void => {
    const why = !COUNTER_NAME_PATTERN.test(name) ? 'name' : kept.has(name) ? 'twice' : typeof value !== 'number' || !Number.isFinite(value) ? 'value' : kept.size >= MAX_COUNTERS ? 'limit' : null;
    if (why || typeof value !== 'number') {
      dropped.push({ name, why: why ?? 'value' });
      return;
    }
    kept.add(name);
    if (kind === 'total') totals[name] = Math.min(MAX_COUNTER_TOTAL, Math.max(0, Math.round(value)));
    else averages[name] = value;
  };
  for (const [name, value] of entriesOf(payload?.totals)) keep(name, value, 'total');
  for (const [name, value] of entriesOf(payload?.averages)) keep(name, value, 'average');

  for (const [name, text] of entriesOf(payload?.labels)) {
    if (!kept.has(name) || typeof text !== 'string') continue;
    const label = text.replace(/\s+/g, ' ').trim().slice(0, MAX_COUNTER_LABEL).trim();
    if (label) labels[name] = label;
  }

  if (dropped.length > 0) {
    // One line per push, with the first few names: enough to find the cause, never a number or a person.
    logWarn('messmass.counter_dropped', 'Counters that break the contract of the photo-stats push were not sent', { dropped: dropped.length, names: dropped.slice(0, 5).map((row) => `${row.name.slice(0, 60)} (${row.why})`) });
  }
  return { totals, averages, labels };
}
