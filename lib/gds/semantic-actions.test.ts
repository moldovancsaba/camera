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

test('the dynamic page visibility actions are registered in the admin vocabulary', () => {
  const pack = cameraAdminVocabularyPacks.find((candidate) => candidate.namespace === 'custom-pages');
  assert.ok(pack);
  assert.ok(pack.actions['custom-pages:hide']);
  assert.ok(pack.actions['custom-pages:show']);
});

test('every journey-list action composed from its namespace is registered', () => {
  const registered = new Set(cameraAdminVocabularyPacks.flatMap((pack) => Object.keys(pack.actions)));
  // ExperienceJourneyList composes these keys at runtime; the static source
  // scan cannot see them inside the JSX template strings.
  const actions = ['test', 'edit', 'rename', 'delete', 'save-name', 'cancel-name', 'confirm-delete', 'cancel-delete'];
  for (const namespace of ['experience-template', 'event-journey']) {
    for (const action of actions) assert.ok(registered.has(`${namespace}:${action}`), `missing ${namespace}:${action}`);
  }
  assert.ok(registered.has('experience-template:customize-inherited-global'));
  assert.ok(registered.has('event-journey:customize-inherited'));
});

test('every scoped journey creation action is registered', () => {
  const registered = new Set(cameraAdminVocabularyPacks.flatMap((pack) => Object.keys(pack.actions)));
  // The global journey manager builds its create action from the level at
  // runtime, so keep all supported scopes in lockstep with its vocabulary.
  for (const level of ['global', 'partner', 'event']) {
    assert.ok(registered.has(`experience-template:${level}-create`), `missing experience-template:${level}-create`);
  }
});
