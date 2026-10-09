import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { isManagementPath } from './log';

const ROOT = join(process.cwd(), 'app', 'api');

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === 'route.ts' ? [full] : [];
  });
}

/** `/api/events/[eventId]/frames` for the file `app/api/events/[eventId]/frames/route.ts`. */
const pathOf = (file: string) => '/api' + file.slice(ROOT.length, -'/route.ts'.length).split(sep).join('/');

/** Management paths that are public by nature (a screen asking for its playlist) and are not an activity of a person who manages. */
const PUBLIC_UNDER_MANAGEMENT_PATHS = new Set(['/api/slideshows/[slideshowId]/playlist', '/api/slideshows/[slideshowId]/next-candidate']);

test('every route on a management path goes through the shared error handler, so what the people who manage the service do reaches the activity log (issue 517)', () => {
  const missing = routes(ROOT)
    .map((file) => ({ file, path: pathOf(file) }))
    .filter(({ path }) => isManagementPath(path) && !PUBLIC_UNDER_MANAGEMENT_PATHS.has(path))
    .filter(({ file }) => !readFileSync(file, 'utf8').includes('withErrorHandler'))
    .map(({ path }) => path);
  assert.deepEqual(missing, [], 'wrap these routes in withErrorHandler (lib/api/withErrorHandler.ts), or they are invisible in the activity log');
});
