/**
 * Guard for the private full-frame original (camera#210).
 *
 * `originalImageUrl` now points at the whole camera image, which shows more of the scene (and of
 * bystanders) than the framed photo. It must never reach a public response. Rather than trusting
 * every future route to remember that, this test lists the only files allowed to mention the
 * field. A new file that reads it fails here until someone has decided, on purpose, that it is
 * not public and added it below with the reason.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ALLOWED: Record<string, string> = {
  'app/api/admin/events/[id]/gallery-frame/route.ts': 'admin API (Events manager role): keeps the editor\'s plain upload as the original when a frame is put on it; reads it only to frame the photo, returns the new picture and no original',
  'app/api/admin/events/[id]/gallery-upload/route.ts': 'admin API (Events manager role): stores the editor\'s own plain upload as the original of the framed picture; the answer goes to that signed-in editor',
  'app/api/e2e/bootstrap/route.ts': 'dev-only test fixtures, blocked in production',
  'app/api/internal/fanmass/events/[eventId]/media/route.ts': 'service-to-service feed behind a shared secret; asks for the raw fan photo by design',
  'app/api/internal/savetheworld/pledges/route.ts': 'only documents that the original is never shown on the public wall',
  'app/api/submissions/route.ts': 'writes the submission; the response goes to the fan who made it',
  'lib/db/schemas.ts': 'type definition',
  'lib/fanmass/media-feed.ts': 'the query behind the fanmass feed (service secret): selects photos that have one, returns no URL itself',
  'lib/email/submission-result-email.ts': 'email to the fan about their own photo',
  'lib/events/event-export.ts': 'admin event export',
  'lib/savetheworld/publishSelfies.ts': 'query that decides which submissions to publish; reads no URL out',
  'lib/savetheworld/wall.ts': 'only documents that the original is excluded from the public wall projection',
  'lib/photo-vetting/review.ts': 'approval stores the composite in the field, as for any photo without a distinct original; no URL is read out',
  'lib/screen/welcome-photo.ts': 'reads it only for an editor\'s own gallery upload (`metadata.adminGalleryUpload`), whose plain upload is kept there, never for a guest\'s private original; the picture is drawn into the welcome page screen and no URL is returned to a public response (the admin picker list is behind an admin session)',
  'lib/submissions/delete-files.ts': 'reads the URL only to delete the file with the submission; returns counts, never a URL',
  'lib/submissions/public-image.ts': 'the public image resolver, which refuses the original when a reframe record exists',
  'lib/tryon/publication.ts': 'builds the derived try-on document; keeps the private original off it',
};

const PUBLIC_SURFACES = [
  'app/api/share/[id]/download/route.ts',
  'app/api/slideshows/[slideshowId]/playlist/route.ts',
  'app/api/slideshows/[slideshowId]/next-candidate/route.ts',
  'app/api/slideshows/[slideshowId]/played/route.ts',
  'app/share/[id]/page.tsx',
  'app/greatest-hits/[slug]/page.tsx',
  'lib/slideshow/playlist.ts',
];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') files.push(...sourceFiles(path));
    } else if (/\.(tsx?|mjs)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

test('only reviewed files mention originalImageUrl', () => {
  const files = ['app', 'lib', 'components', 'scripts'].flatMap(sourceFiles);

  const referencing = files.filter((file) => readFileSync(file, 'utf8').includes('originalImageUrl')).sort();
  const unexpected = referencing.filter((file) => !(file in ALLOWED));
  assert.deepEqual(
    unexpected,
    [],
    `These files read originalImageUrl, which is the private full-frame original. If a file is not public, add it to ALLOWED with the reason: ${unexpected.join(', ')}`
  );

  const stale = Object.keys(ALLOWED).filter((file) => !referencing.includes(file));
  assert.deepEqual(stale, [], `Remove from ALLOWED, they no longer mention the field: ${stale.join(', ')}`);
});

test('the public surfaces neither mention the original nor its reframe record', () => {
  for (const file of PUBLIC_SURFACES) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('originalImageUrl'), false, `${file} must not read originalImageUrl`);
    assert.equal(/\breframe\b/.test(source), false, `${file} must not read the reframe record`);
  }
});

test('the slideshow slide only ever carries an id, an image URL and a size', () => {
  const source = readFileSync('lib/slideshow/playlist.ts', 'utf8');
  const slideShape = /export interface Slide \{[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
  assert.ok(slideShape.includes('_id: string') && slideShape.includes('imageUrl: string'));
  assert.equal(/originalImageUrl|reframe/.test(slideShape), false);
});
