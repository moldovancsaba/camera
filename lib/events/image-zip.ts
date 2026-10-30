/**
 * Event image ZIP stream
 *
 * Builds the .zip that `GET /api/admin/events/[id]/export/images?format=zip` sends back: every image of the event, fetched from its host
 * and stored as `<kind>/<NNNN>-<submissionId>.<ext>`, plus `_errors.txt` for failed downloads and `_not-included.txt` for items without a
 * retained source or skipped at the bounded work deadline. One failed picture never aborts the archive.
 *
 * Why this is its own module: the route holds the access check, the database reads and the size cap; the archive itself had no test, and
 * the archiver package changes its API from one major to the next (7 had a default export, 8 has `ZipArchive`). With the loop here and the
 * fetch handed in, `image-zip.test.ts` checks the real bytes of the archive (names, contents, checksums, the errors file) without a database.
 *
 * Images are fetched in small bounded batches in the background while the response is read. A name that is already taken gets a suffix;
 * compression level is 6. Batching reduces the chance that ordinary CDN latency exceeds the serverless response window.
 */

import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { imageExtension, type EventImage } from '@/lib/events/event-export';

/** How a picture is fetched: the global `fetch` in the route, a fake in the test. */
export type ImageFetcher = (url: string, signal?: AbortSignal) => Promise<Response>;

export function createImagesZip(
  images: EventImage[],
  fetchImage: ImageFetcher = (url, signal) => fetch(url, { signal }),
  notIncludedMessages: string[] = []
): ReadableStream<Uint8Array> {
  const archive = new ZipArchive({ zlib: { level: 6 } });

  // Drive fetch + append in the background; the archive streams out as the client reads. Per-image issues go into manifests rather than aborting.
  (async () => {
    const startedAt = Date.now();
    const failures: string[] = [];
    const notIncluded = [...notIncludedMessages];
    const usedNames = new Set<string>();
    for (let offset = 0; offset < images.length; offset += IMAGE_FETCH_CONCURRENCY) {
      if (Date.now() + MAX_IMAGE_BATCH_MS >= startedAt + IMAGE_ZIP_WORK_BUDGET_MS) {
        notIncluded.push(...images.slice(offset).map((image) => `Photo ${image.submissionId || 'unknown'}: export time budget reached before download.`));
        break;
      }
      const batch = images.slice(offset, offset + IMAGE_FETCH_CONCURRENCY);
      const downloaded = await Promise.all(batch.map(async (image, batchIndex) => {
        try {
          const result = await fetchWithRetry(image.url, fetchImage);
          return { image, index: offset + batchIndex + 1, ...result };
        } catch (error) {
          return { image, index: offset + batchIndex + 1, error: error instanceof Error ? error.message : 'fetch failed' };
        }
      }));

      for (const result of downloaded) {
        if ('error' in result) {
          failures.push(`${result.image.url} -> ${result.error}`);
          continue;
        }
        if (!result.response.ok) {
          failures.push(`${result.image.url} -> HTTP ${result.response.status}`);
          continue;
        }
        if (!result.buffer) {
          failures.push(`${result.image.url} -> Image response had no content`);
          continue;
        }
        const ext = imageExtension(result.response.headers.get('content-type'), result.image.url);
        const prefix = String(result.index).padStart(4, '0');
        let name = `${result.image.kind}/${prefix}-${result.image.submissionId || 'image'}.${ext}`;
        // Guard against the rare collision when two submissions share an id.
        while (usedNames.has(name)) {
          name = `${result.image.kind}/${prefix}-${result.image.submissionId || 'image'}-${usedNames.size}.${ext}`;
        }
        usedNames.add(name);
        archive.append(result.buffer, { name });
      }
    }

    if (failures.length > 0) {
      archive.append(`${failures.length} image(s) could not be fetched:\n\n${failures.join('\n')}\n`, { name: '_errors.txt' });
    }
    if (notIncluded.length > 0) {
      archive.append(`${notIncluded.length} photo(s) were not included:\n\n${notIncluded.join('\n')}\n`, { name: '_not-included.txt' });
    }
    await archive.finalize();
  })().catch((error) => {
    archive.abort();
    console.error('Event image ZIP export failed:', error);
  });

  // Node Readable -> Web ReadableStream for the App Router Response body.
  return Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;
}

const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const IMAGE_FETCH_ATTEMPTS = 3;
const IMAGE_FETCH_CONCURRENCY = 8;
const IMAGE_ZIP_WORK_BUDGET_MS = 95_000;
const MAX_IMAGE_BATCH_MS = IMAGE_FETCH_TIMEOUT_MS * IMAGE_FETCH_ATTEMPTS + 3_000;

/** Retry transient image-host/network failures without allowing a request to hang the whole export. */
async function fetchWithRetry(url: string, fetchImage: ImageFetcher): Promise<{ response: Response; buffer?: Buffer }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= IMAGE_FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Image download timed out')), IMAGE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImage(url, controller.signal);
      const retryableStatus = [408, 425, 429].includes(response.status) || response.status >= 500;
      if (retryableStatus && attempt < IMAGE_FETCH_ATTEMPTS) {
        await response.body?.cancel().catch(() => undefined);
      } else if (!response.ok) {
        return { response };
      } else {
        return { response, buffer: Buffer.from(await response.arrayBuffer()) };
      }
    } catch (error) {
      lastError = error;
      if (attempt === IMAGE_FETCH_ATTEMPTS) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 200));
  }
  throw lastError instanceof Error ? lastError : new Error('Image download failed');
}
