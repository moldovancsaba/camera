import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/** Every source file of the capture flow, the user's pages of an event. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

test('no page of the capture flow dims the page with a black veil: a veil is the page colour of the event (owner, 2026-10-09)', () => {
  const files = [...sources(path.join(process.cwd(), 'components', 'capture')), ...sources(path.join(process.cwd(), 'app', 'capture')), ...sources(path.join(process.cwd(), 'components', 'camera'))];
  assert.ok(files.length > 5);
  const offenders = files.filter((file) => /bg-black|bg-slate-9|bg-gray-9|bg-neutral-9/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => path.relative(process.cwd(), file)), [], 'use `color-mix(in srgb, var(--event-bg) 80%, transparent)` for a veil');
});
