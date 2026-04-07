/**
 * Load variables from `.env` then `.env.local` (later file wins per key).
 * Does not override keys already set in `process.env` (shell wins).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function mergeFileIntoMap(text: string, map: Map<string, string>): void {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
}

export function loadEnvFromFiles(): void {
  const merged = new Map<string, string>();
  for (const name of ['.env', '.env.local']) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    mergeFileIntoMap(readFileSync(p, 'utf8'), merged);
  }
  for (const [key, val] of merged) {
    if (val && !process.env[key]?.trim()) {
      process.env[key] = val;
    }
  }
}
