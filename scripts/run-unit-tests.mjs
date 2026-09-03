#!/usr/bin/env node
// WHAT: Discovers and runs every *.test.ts/*.test.tsx file in the repo
//     (excluding node_modules/.next/worktrees), each with the invocation it
//     actually needs, and exits non-zero if any file fails.
// WHY: package.json's test:unit script used to hardcode exactly one test
//     file's path -- every other unit test added since then (camera#147)
//     silently never ran in CI or locally via `npm run test:unit`. Auto-
//     discovery means a newly-added test file is picked up with zero
//     maintenance here.
//
// Two invocation groups exist because node:test's mock.module() requires
// --experimental-test-module-mocks (only recognized by `node`, not `tsx`
// alone) -- files using it are detected by grepping for "mock.module(" and
// run via `node --experimental-test-module-mocks --import tsx <file>`;
// everything else runs via the simpler `node --import tsx <file>`.

import { globSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const testFiles = globSync(['**/*.test.ts', '**/*.test.tsx'], {
  exclude: (path) => path.includes('node_modules') || path.includes('.next') || path.includes('.claude'),
}).sort();

if (testFiles.length === 0) {
  console.error('No *.test.ts/*.test.tsx files found.');
  process.exit(1);
}

let failed = 0;
for (const file of testFiles) {
  const needsModuleMocks = readFileSync(file, 'utf8').includes('mock.module(');
  const nodeArgs = needsModuleMocks
    ? ['--experimental-test-module-mocks', '--import', 'tsx', file]
    : ['--import', 'tsx', file];

  console.log(`\n--- ${file} ---`);
  const result = spawnSync(process.execPath, nodeArgs, { stdio: 'inherit' });

  if (result.status !== 0) {
    failed++;
    console.error(`FAILED: ${file} (exit ${result.status})`);
  }
}

console.log(`\n${testFiles.length - failed}/${testFiles.length} test file(s) passed.`);
process.exit(failed > 0 ? 1 : 0);
