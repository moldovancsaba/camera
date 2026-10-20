/**
 * Guard for the recorded copies (issue 509).
 *
 * `Submission.imageCopies` names the private unframed crop (a Blob `pending/…` file and its ImgBB copy) and holds the ImgBB delete links, which are secrets. It must never reach a
 * public response or a browser. Rather than trusting every future route to remember that, this test lists the only files allowed to mention the field: a new file that reads it fails
 * here until someone has decided, on purpose, that it is not public and added it below with the reason (the same device as lib/submissions/original-exposure.test.ts).
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ALLOWED: Record<string, string> = {
  'lib/db/schemas.ts': 'type definition',
  'lib/library/fake-db.ts': 'the in-memory test database; a comment names the field as an example of a positional update',
  'lib/storage/image-copies.ts': 'records and reads the copies; server only',
  'app/api/admin/image-safety/route.ts': 'admin API (global admins only): the Image safety card; a comment names the field, the answers carry counts, ids and public addresses, never a delete link or the private file address',
  'lib/storage/image-safety.ts': 'reads the copies to count and to make the missing ones (admin API only); its answers name the private crop by photo id, never by address',
  'lib/photo-vetting/review.ts': 'names the dependency that records the copies after an approval; reads no copy',
  'lib/photo-vetting/queue.ts': 'admin-only vetting and analysis queue; exposes only the verified original image URL, never copy metadata or delete links',
  'lib/fanmass/photo-results.ts': 'admin-only, event-manager-authorized Fanmass review page uses the verified photo URL to display the image; no public route or API returns image-copy metadata or delete links',
  'lib/submissions/delete-files.ts': 'reads the addresses and delete links only to delete the files with the submission; returns counts and public ImgBB addresses, never a delete link',
  'app/api/internal/purge-unconsented-captures/route.ts': 'scheduled server-only cleanup deletes expired unconsented photos; its response contains counts only',
};

const PUBLIC_SURFACES = [
  'app/api/share/[id]/download/route.ts',
  'app/api/slideshows/[slideshowId]/playlist/route.ts',
  'app/api/slideshows/[slideshowId]/next-candidate/route.ts',
  'app/api/slideshows/[slideshowId]/played/route.ts',
  'app/share/[id]/page.tsx',
  'lib/slideshow/playlist.ts',
  'lib/submissions/share-lookup.ts',
  'lib/submissions/public-image.ts',
  'lib/gallery/submissions.ts',
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

test('only reviewed files mention imageCopies', () => {
  const files = ['app', 'lib', 'components', 'scripts'].flatMap(sourceFiles);
  const referencing = files.filter((file) => readFileSync(file, 'utf8').includes('imageCopies')).sort();
  const unexpected = referencing.filter((file) => !(file in ALLOWED));
  assert.deepEqual(unexpected, [], `These files read imageCopies, which names private pictures and holds delete links. If a file is not public, add it to ALLOWED with the reason: ${unexpected.join(', ')}`);
  const stale = Object.keys(ALLOWED).filter((file) => !referencing.includes(file));
  assert.deepEqual(stale, [], `Remove from ALLOWED, they no longer mention the field: ${stale.join(', ')}`);
});

test('the public surfaces neither read the copies nor the private photo address', () => {
  for (const file of PUBLIC_SURFACES) {
    const source = readFileSync(file, 'utf8');
    assert.equal(source.includes('imageCopies'), false, `${file} must not read imageCopies`);
    assert.equal(/photoReview\??\.photoUrl|photoReview\.photoUrl/.test(source), false, `${file} must not read the private photo address`);
  }
});
