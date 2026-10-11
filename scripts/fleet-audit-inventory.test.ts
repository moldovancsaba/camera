// WHAT: Runs the Python unit tests of the fleet inventory scanner
//   (scripts/test_fleet_audit_inventory.py) as part of `npm run test:unit`.
// WHY: the scanner is a Python file, and the unit-test runner only discovers
//   *.test.ts files. The Python tests pin the rules that keep docs/_audit/*.json
//   identical in every git worktree and free of merge conflicts between branches
//   (the repo name from the remote, directories skipped only below the repo root,
//   no timestamp / commit / counts in the files, one item per line), so they must
//   run in the same gate as everything else.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('the inventory scanner passes its Python unit tests', () => {
  const testFile = fileURLToPath(new URL('./test_fleet_audit_inventory.py', import.meta.url));
  // -B: do not write __pycache__ next to the scripts.
  const result = spawnSync('python3', ['-B', testFile], { encoding: 'utf8' });
  assert.equal(result.error, undefined, `python3 could not be started: ${String(result.error)}`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
