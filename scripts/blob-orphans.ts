/**
 * Report-only inventory of Blob files that no database document refers to (camera#211):
 * files left by submissions deleted before file cleanup existed, and full-frame originals
 * uploaded by the browser whose submission was never saved. It deletes nothing.
 *
 * Usage: npm run blob:orphans -- [--list]
 *   Needs MONGODB_URI, MONGODB_DB and BLOB_READ_WRITE_TOKEN (`vercel env pull` for the last).
 *   --list prints every orphan pathname instead of the first 20.
 */

import { list } from '@vercel/blob';
import { MongoClient } from 'mongodb';
import { loadEnvFromFiles } from './load-env-from-files';
import { blobUrlsIn, findOrphans, type StoredFile } from '../lib/submissions/blob-orphans';
import { blobStoreHostFromToken } from '../lib/submissions/original-image';

loadEnvFromFiles();
const GRACE_MS = 24 * 60 * 60 * 1000;

const token = process.env.BLOB_READ_WRITE_TOKEN;
const storeHost = blobStoreHostFromToken(token);
if (!token || !storeHost || !process.env.MONGODB_URI) {
  console.error('Set MONGODB_URI, MONGODB_DB and BLOB_READ_WRITE_TOKEN (vercel env pull) first.');
  process.exit(1);
}

const files: StoredFile[] = [];
let cursor: string | undefined;
do {
  const page = await list({ token, cursor, limit: 1000 });
  files.push(...page.blobs.map((b) => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })));
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

const client = new MongoClient(process.env.MONGODB_URI);
const referenced = new Set<string>();
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'camera');
  for (const { name } of await db.listCollections().toArray()) {
    for await (const doc of db.collection(name).find({})) {
      for (const url of blobUrlsIn(JSON.stringify(doc), storeHost)) referenced.add(url);
    }
  }
} finally {
  await client.close();
}

const { orphans, inGrace } = findOrphans(files, referenced, { now: new Date(), graceMs: GRACE_MS });
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const topFolder = (f: StoredFile) => f.pathname.split('/')[0] || '(root)';

console.log(`${files.length} files in the store, ${referenced.size} URLs referenced by the database`);
console.log(`${orphans.length} orphans (${mb(orphans.reduce((n, f) => n + f.size, 0))} MB); ${inGrace.length} more are under 24 h old and may be uploads in flight\n`);
const byFolder = new Map<string, { count: number; bytes: number }>();
for (const f of orphans) {
  const entry = byFolder.get(topFolder(f)) ?? { count: 0, bytes: 0 };
  byFolder.set(topFolder(f), { count: entry.count + 1, bytes: entry.bytes + f.size });
}
for (const [folder, { count, bytes }] of [...byFolder].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${folder.padEnd(14)} ${String(count).padStart(6)} files  ${mb(bytes).padStart(8)} MB`);
}
const shown = process.argv.includes('--list') ? orphans : orphans.slice(0, 20);
if (shown.length) console.log(`\n${process.argv.includes('--list') ? 'All' : 'First 20'} orphans:\n${shown.map((f) => `  ${f.uploadedAt.toISOString().slice(0, 10)}  ${f.pathname}`).join('\n')}`);
