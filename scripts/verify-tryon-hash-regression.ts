// scripts/verify-tryon-hash-regression.ts
// WHAT: Regression lock for buildTryOnRequestHash's outfit extension
//     (camera#116, contract requirement recorded by try-on#39).
// WHY: The dedup hash decides whether two submits collapse into one try-on
//     job. The outfit extension must be null-safe - for every no-bottom
//     input the output must be byte-identical to the pre-outfit
//     implementation (reproduced inline here as the reference), so no
//     existing dedup behavior shifts on deploy - while a top-only job and a
//     top+bottom job for the same submission must never collide.
// RUN: npx tsx scripts/verify-tryon-hash-regression.ts

import { createHash } from 'node:crypto';
import { buildTryOnRequestHash } from '../lib/tryon/hash';

// The pre-outfit implementation, verbatim (the reference oracle).
function legacyHash(submissionId: string, leatherSuitId: string, pipelineVersion: string, setupId?: string | null): string {
  const normalizedSetupId = typeof setupId === 'string' && setupId.trim() ? setupId.trim() : null;
  return createHash('sha256')
    .update(`${submissionId}:${leatherSuitId}:${pipelineVersion}:${normalizedSetupId || ''}`)
    .digest('hex');
}

const fixtures: Array<[string, string, string, string | null]> = [
  ['sub_1', 'motogp_honda_castrol_2026_v1', '1.0.0', null],
  ['sub_1', 'motogp_honda_castrol_2026_v1', '1.0.0', 'setup_default'],
  ['685f1c2b9d3e4a0012345678', 'jersey_home_kit_v1', '1.0.0', null],
  ['sub_with:colon', 'top_fc_example_v1', '1.0.0', '  padded_setup  '],
  ['sub_2', 'bottom_fc_example_v1', '1.0.0', ''],
];

let failures = 0;

// 1. No-bottom inputs: byte-identical to the legacy implementation.
for (const [sub, suit, ver, setup] of fixtures) {
  const expected = legacyHash(sub, suit, ver, setup);
  for (const bottom of [undefined, null, '', '   '] as const) {
    const actual = buildTryOnRequestHash(sub, suit, ver, setup, bottom);
    if (actual !== expected) {
      failures += 1;
      console.error(`FAIL no-bottom regression: (${sub}, ${suit}, ${setup}, bottom=${JSON.stringify(bottom)})`);
    }
  }
}

// 2. With a bottom: differs from the top-only hash, deterministic, and
//    sensitive to the bottom id.
const topOnly = buildTryOnRequestHash('sub_1', 'top_fc_example_v1', '1.0.0', null);
const outfitA = buildTryOnRequestHash('sub_1', 'top_fc_example_v1', '1.0.0', null, 'bottom_fc_example_v1');
const outfitA2 = buildTryOnRequestHash('sub_1', 'top_fc_example_v1', '1.0.0', null, 'bottom_fc_example_v1');
const outfitB = buildTryOnRequestHash('sub_1', 'top_fc_example_v1', '1.0.0', null, 'bottom_fc_away_v1');
if (outfitA === topOnly) {
  failures += 1;
  console.error('FAIL outfit hash must differ from the top-only hash for the same submission');
}
if (outfitA !== outfitA2) {
  failures += 1;
  console.error('FAIL outfit hash must be deterministic');
}
if (outfitA === outfitB) {
  failures += 1;
  console.error('FAIL outfit hash must be sensitive to the bottom id');
}

if (failures > 0) {
  console.error(`verify-tryon-hash-regression: ${failures} failure(s)`);
  process.exit(1);
}
console.log('verify-tryon-hash-regression: ok  no-bottom byte-identical to legacy; outfit distinct, deterministic, bottom-sensitive');
