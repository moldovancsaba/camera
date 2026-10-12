/**
 * Event image ZIP stream
 *
 * Builds the .zip that `GET /api/admin/events/[id]/export/images?format=zip` sends back: every image of the event, fetched from its host
 * and stored as `<kind>/<NNNN>-<submissionId>.<ext>`, plus an `_errors.txt` that names every image that could not be fetched. One failed
 * picture never aborts the archive.
 *
 * Why this is its own module: the route holds the access check, the database reads and the size cap; the archive itself had no test, and
 * the archiver package changes its API from one major to the next (7 had a default export, 8 has `ZipArchive`). With the loop here and the
 * fetch handed in, `image-zip.test.ts` checks the real bytes of the archive (names, contents, checksums, the errors file) without a database.
 *
 * The behaviour is the one the route always had: all pictures are fetched one after the other in the background while the response is read,
 * a name that is already taken gets a suffix, the compression level is 6.
 */

import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { imageExtension, type EventImage } from '@/lib/events/event-export';

/** How a picture is fetched: the global `fetch` in the route, a fake in the test. */
export type ImageFetcher = (url: string) => Promise<Response>;

export function createImagesZip(images: EventImage[], fetchImage: ImageFetcher = (url) => fetch(url)): ReadableStream<Uint8Array> {
  const archive = new ZipArchive({ zlib: { level: 6 } });

  // Drive fetch + append in the background; the archive streams out as the client reads. A per-image failure is recorded in _errors.txt
  // rather than aborting.
  (async () => {
    const failures: string[] = [];
    const usedNames = new Set<string>();
    let index = 0;

    for (const image of images) {
      index += 1;
      try {
        const response = await fetchImage(image.url);
        if (!response.ok) {
          failures.push(`${image.url} -> HTTP ${response.status}`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = imageExtension(response.headers.get('content-type'), image.url);
        const prefix = String(index).padStart(4, '0');
        let name = `${image.kind}/${prefix}-${image.submissionId || 'image'}.${ext}`;
        // Guard against the rare collision when two submissions share an id.
        while (usedNames.has(name)) {
          name = `${image.kind}/${prefix}-${image.submissionId || 'image'}-${usedNames.size}.${ext}`;
        }
        usedNames.add(name);
        archive.append(buffer, { name });
      } catch (error) {
        failures.push(`${image.url} -> ${error instanceof Error ? error.message : 'fetch failed'}`);
      }
    }

    if (failures.length > 0) {
      archive.append(`${failures.length} image(s) could not be fetched:\n\n${failures.join('\n')}\n`, { name: '_errors.txt' });
    }
    await archive.finalize();
  })().catch((error) => {
    archive.abort();
    console.error('Event image ZIP export failed:', error);
  });

  // Node Readable -> Web ReadableStream for the App Router Response body.
  return Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
}
