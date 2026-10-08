import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cameraAdminVocabularyPacks } from './camera-admin-vocabulary';

/**
 * A button written `action="pack:id"` throws "Unknown semantic action" when it is drawn if the admin vocabulary does not know the action, and the
 * whole page falls over (the event editor crashed on 2026-10-08 for the welcome button of #308). Every action used in the code must be registered.
 */
/** Every .ts and .tsx file under the folders, tests and dependencies left out. */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

test('every semantic action used in the code is registered in the admin vocabulary', () => {
  const registered = new Set(cameraAdminVocabularyPacks.flatMap((pack) => Object.keys(pack.actions)));
  const files = ['app', 'components', 'lib'].flatMap(sourceFiles);
  const used = new Map<string, string>();
  for (const file of files) {
    for (const match of readFileSync(file, 'utf8').matchAll(/action=(?:"([a-z0-9-]+:[a-z0-9-]+)"|\{'([a-z0-9-]+:[a-z0-9-]+)'\}|\{`([a-z0-9-]+:[a-z0-9-]+)`\})/g)) {
      used.set(match[1] ?? match[2] ?? match[3], file);
    }
  }
  assert.ok(used.size > 50, `the scan found the actions of the code (${used.size})`);
  const missing = [...used].filter(([action]) => !registered.has(action)).map(([action, file]) => `${action} (${file})`);
  assert.deepEqual(missing, [], 'unregistered semantic actions: register them in lib/gds/camera-admin-vocabulary.ts');
});
