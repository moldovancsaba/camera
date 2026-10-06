/**
 * Finds stored files nothing refers to any more (camera#211): the Blob store is listed, every
 * database document is searched for URLs of this project's store, and the difference is the
 * orphans. Pure so it is unit-tested; scripts/blob-orphans.ts does the listing and reporting.
 */

export interface StoredFile {
  url: string;
  pathname: string;
  size: number;
  uploadedAt: Date;
}

function key(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/** Every URL on `storeHost` mentioned anywhere in `text` (a JSON-serialised document). */
export function blobUrlsIn(text: string, storeHost: string): string[] {
  const host = storeHost.replace(/\./g, '\\.');
  return text.match(new RegExp(`https://${host}/[^"'\\s\\\\)]+`, 'gi')) ?? [];
}

/** Files in the store that no referenced URL points at, with `youngerThanMs` grace for in-flight uploads. */
export function findOrphans(
  files: StoredFile[],
  referencedUrls: Iterable<string>,
  options: { now: Date; graceMs: number }
): { orphans: StoredFile[]; inGrace: StoredFile[] } {
  const referenced = new Set<string>();
  for (const url of referencedUrls) {
    const k = key(url);
    if (k) referenced.add(k);
  }
  const unreferenced = files.filter((file) => {
    const k = key(file.url);
    return k !== null && !referenced.has(k);
  });
  const isYoung = (file: StoredFile) => options.now.getTime() - file.uploadedAt.getTime() < options.graceMs;
  return { orphans: unreferenced.filter((f) => !isYoung(f)), inGrace: unreferenced.filter(isYoung) };
}
