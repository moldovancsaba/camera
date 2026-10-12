/**
 * Event image ZIP stream
 *
 * Builds the .zip that `GET /api/admin/events/[id]/export/images?format=zip` sends back: every image of the event, fetched from its host
 * and stored as `<kind>/<NNNN>-<submissionId>.<ext>`, plus an `_errors.txt` that names every image that could not be fetched. One failed
 * picture never aborts the archive.
 *
 * The archive is written here, with `node:zlib`, instead of by an archive library (the `archiver` package brought 50 packages for this one
 * route). The format used is the plain one every unzip tool reads: one local header and the data per file, then the central directory and
 * the end record. Each file is deflated (level 6) and kept stored when that does not make it smaller, which is what a JPEG usually does;
 * names are UTF-8 (flag bit 11); sizes are known before a header is written, so no data descriptor is needed.
 *
 * What the plain format cannot hold (no ZIP64): a single archive past 4 GiB, or more than 65535 files. The route caps an export at 500
 * pictures, so the count never matters; the size can only matter for 500 very large originals. A picture that would take the archive past
 * the limit is left out and named in `_errors.txt`, so the download is always a valid zip.
 *
 * The stream is pulled: a picture is fetched when the client has read the one before it (one at a time in memory), not all at once in the
 * background.
 *
 * `lib/events/image-zip.test.ts` reads the finished archive with a reader of its own, so it checks the real bytes.
 */

import { crc32, deflateRaw } from 'node:zlib';
import { promisify } from 'node:util';
import { imageExtension, type EventImage } from '@/lib/events/event-export';

/** How a picture is fetched: the global `fetch` in the route, a fake in the test. */
export type ImageFetcher = (url: string) => Promise<Response>;

export interface ImagesZipOptions {
  /** Largest archive in bytes, end record included. The format without ZIP64 stops at 4 GiB; tests lower it. */
  maxBytes?: number;
  /** Time written into every entry (DOS date and time have 2-second steps, local to nobody: UTC here). */
  now?: Date;
}

/** The end of what a 32-bit offset and size can say, minus a margin. */
export const ZIP_MAX_BYTES = 0xffffffff - 1024;

/** Room kept free for `_errors.txt` (500 pictures at about 300 characters of reason each is 150 kB). */
const ERRORS_RESERVE = 1024 * 1024;

const deflateRawAsync = promisify(deflateRaw);
const encoder = new TextEncoder();

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const UTF8_NAMES = 0x0800;
const STORED = 0;
const DEFLATED = 8;

/** MS-DOS date and time (UTC, 2-second steps), the way the zip format keeps them. */
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

interface CentralEntry {
  name: Uint8Array;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  offset: number;
}

class ZipWriter {
  private offset = 0;
  private readonly central: CentralEntry[] = [];
  private centralBytes = 0;
  private readonly stamp: { time: number; day: number };

  constructor(private readonly maxBytes: number, now: Date) {
    this.stamp = dosDateTime(now);
  }

  /** Whether a file of this name and size still fits, counting its central directory record and the end record. */
  fits(name: string, dataBytes: number): boolean {
    const nameBytes = encoder.encode(name).length;
    const total = this.offset + 30 + nameBytes + dataBytes + this.centralBytes + 46 + nameBytes + 22;
    return this.central.length < 0xffff && total <= this.maxBytes;
  }

  /** The bytes of one file entry (local header and data). The caller sends them on and then asks for the next. */
  async file(name: string, content: Uint8Array): Promise<Uint8Array> {
    const nameBytes = encoder.encode(name);
    const deflated = content.length > 0 ? await deflateRawAsync(content, { level: 6 }) : Buffer.alloc(0);
    const useDeflate = content.length > 0 && deflated.length < content.length;
    const data: Uint8Array = useDeflate ? deflated : content;
    const crc = content.length > 0 ? crc32(content) : 0;

    const header = Buffer.alloc(30 + nameBytes.length);
    header.writeUInt32LE(LOCAL_HEADER, 0);
    header.writeUInt16LE(20, 4); // version needed to extract
    header.writeUInt16LE(UTF8_NAMES, 6);
    header.writeUInt16LE(useDeflate ? DEFLATED : STORED, 8);
    header.writeUInt16LE(this.stamp.time, 10);
    header.writeUInt16LE(this.stamp.day, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28); // extra field length
    header.set(nameBytes, 30);

    this.central.push({ name: nameBytes, method: useDeflate ? DEFLATED : STORED, crc, compressedSize: data.length, size: content.length, offset: this.offset });
    this.centralBytes += 46 + nameBytes.length;
    const entry = Buffer.concat([header, data]);
    this.offset += entry.length;
    return entry;
  }

  /** The central directory and the end record: the last bytes of the archive. */
  finish(): Uint8Array {
    const directory = Buffer.alloc(this.centralBytes + 22);
    let at = 0;
    for (const entry of this.central) {
      directory.writeUInt32LE(CENTRAL_HEADER, at);
      directory.writeUInt16LE((3 << 8) | 20, at + 4); // made by: Unix, zip 2.0
      directory.writeUInt16LE(20, at + 6);
      directory.writeUInt16LE(UTF8_NAMES, at + 8);
      directory.writeUInt16LE(entry.method, at + 10);
      directory.writeUInt16LE(this.stamp.time, at + 12);
      directory.writeUInt16LE(this.stamp.day, at + 14);
      directory.writeUInt32LE(entry.crc, at + 16);
      directory.writeUInt32LE(entry.compressedSize, at + 20);
      directory.writeUInt32LE(entry.size, at + 24);
      directory.writeUInt16LE(entry.name.length, at + 28);
      // extra field, comment, disk number and internal attributes stay 0
      directory.writeUInt32LE(((0o100644 << 16) >>> 0), at + 38); // external attributes: a regular file, rw-r--r--
      directory.writeUInt32LE(entry.offset, at + 42);
      directory.set(entry.name, at + 46);
      at += 46 + entry.name.length;
    }
    directory.writeUInt32LE(END_RECORD, at);
    directory.writeUInt16LE(this.central.length, at + 8);
    directory.writeUInt16LE(this.central.length, at + 10);
    directory.writeUInt32LE(this.centralBytes, at + 12);
    directory.writeUInt32LE(this.offset, at + 16);
    return directory;
  }
}

export function createImagesZip(
  images: EventImage[],
  fetchImage: ImageFetcher = (url) => fetch(url),
  options: ImagesZipOptions = {}
): ReadableStream<Uint8Array> {
  const zip = new ZipWriter(options.maxBytes ?? ZIP_MAX_BYTES, options.now ?? new Date());
  const failures: string[] = [];
  const usedNames = new Set<string>();
  let index = 0;
  let finished = false;

  return new ReadableStream<Uint8Array>({
    // One picture per pull: the client has read what was sent before, so memory holds one picture, not the event.
    async pull(controller) {
      try {
        while (index < images.length) {
          const image = images[index];
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
            // Leave room for _errors.txt, so that the file that explains a gap always fits.
            if (!zip.fits(name, buffer.length + ERRORS_RESERVE)) {
              failures.push(`${image.url} -> left out: the archive would pass the 4 GiB a zip file without ZIP64 can hold`);
              continue;
            }
            usedNames.add(name);
            controller.enqueue(await zip.file(name, buffer));
            return; // one entry sent: wait for the next pull
          } catch (error) {
            failures.push(`${image.url} -> ${error instanceof Error ? error.message : 'fetch failed'}`);
          }
        }

        if (!finished) {
          finished = true;
          if (failures.length > 0) {
            const report = `${failures.length} image(s) could not be fetched:\n\n${failures.join('\n')}\n`;
            controller.enqueue(await zip.file('_errors.txt', encoder.encode(report)));
          }
          controller.enqueue(zip.finish());
          controller.close();
        }
      } catch (error) {
        console.error('Event image ZIP export failed:', error);
        controller.error(error);
      }
    },
  });
}
