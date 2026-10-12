import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test, type TestContext } from 'node:test';

/**
 * issue 229: `useGdsToasts()` of the design system drew nothing in the admin (no `GdsNotificationCenter` is mounted, and its hidden live region stayed
 * empty), so a "Saved" or "Delete failed" notice reached nobody. The admin shows notices through `components/admin/notify.ts`
 * (`showGdsNotification`, drawn by the Mantine host `GdsProvider` mounts). These tests keep it that way.
 */

type NotifyModule = typeof import('./notify');
const load = (id: string) => import('./notify?case=' + id) as Promise<NotifyModule>;

function setup(t: TestContext) {
  const shown: Array<{ message: string; title?: string; tone?: string; autoClose?: number | false }> = [];
  t.mock.module('@sovereignsquad/gds-theme/client', { exports: { showGdsNotification: (options: (typeof shown)[number]) => shown.push(options) } });
  return shown;
}

test('a success is drawn in the success tone and closes by itself after about 4 seconds', async (t) => {
  const shown = setup(t);
  const { notifyAdminSuccess } = await load('success');
  notifyAdminSuccess({ title: 'Saved', message: 'Existing events keep what they have.' });
  assert.deepEqual(shown, [{ title: 'Saved', message: 'Existing events keep what they have.', tone: 'success', autoClose: 4000 }]);
});

test('an error is drawn in the error tone and stays until the user dismisses it', async (t) => {
  const shown = setup(t);
  const { notifyAdminError } = await load('error');
  notifyAdminError({ title: 'Delete failed', message: 'The event is in use' });
  assert.deepEqual(shown, [{ title: 'Delete failed', message: 'The event is in use', tone: 'error', autoClose: false }]);
});

test('a plain string is a notice without a heading, and no empty title is sent', async (t) => {
  const shown = setup(t);
  const { notifyAdminError, notifyAdminSuccess } = await load('plain');
  notifyAdminSuccess('Copied');
  notifyAdminError({ message: 'Failed' });
  assert.deepEqual(shown, [
    { message: 'Copied', tone: 'success', autoClose: 4000 },
    { message: 'Failed', tone: 'error', autoClose: false },
  ]);
  assert.ok(shown.every((options) => !('title' in options)));
});

/** Every .ts and .tsx file under a folder, tests and dependencies left out. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [full] : [];
  });
}

/** The code of a file without its comments, so a comment that explains the rule is not taken for a use of it. */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const usesToasts = (source: string) => /\b(useGdsToasts|GdsToastProvider)\b/.test(withoutComments(source));

test('the detector sees an import and a provider, and ignores a comment about them', () => {
  assert.ok(usesToasts("import { useGdsToasts } from '@sovereignsquad/gds-core/client';"));
  assert.ok(usesToasts("import {\n  InlineAlert,\n  useGdsToasts,\n} from '@sovereignsquad/gds-core/client';\nconst { notifyError } = useGdsToasts();"));
  assert.ok(usesToasts('<GdsToastProvider>{children}</GdsToastProvider>'));
  assert.ok(!usesToasts("/** `useGdsToasts()` drew nothing */\n// GdsToastProvider is gone\nconst url = 'https://example.test';"));
});

test('nothing under app/ or components/ uses useGdsToasts or GdsToastProvider: the notices would be invisible (issue 229)', () => {
  const files = ['app', 'components'].flatMap((folder) => sources(path.join(process.cwd(), folder)));
  assert.ok(files.length > 100, `the scan found the sources (${files.length})`);
  const offenders = files.filter((file) => usesToasts(readFileSync(file, 'utf8'))).map((file) => path.relative(process.cwd(), file));
  assert.deepEqual(offenders, [], 'use notifyAdminSuccess / notifyAdminError from components/admin/notify.ts (the capture pages use components/capture/notify.ts)');
});
