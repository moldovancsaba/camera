/**
 * Verify Camera-side try-on prerequisites.
 *
 * Usage:
 *   npx tsx scripts/verify-tryon-prereqs.ts
 */

import { del, put } from '@vercel/blob';
import { MongoClient } from 'mongodb';
import { loadEnvFromFiles } from './load-env-from-files';
import { getConfiguredSiteUrl } from '@/lib/site-url';

async function testMongo(uri: string, dbName: string): Promise<MongoClient> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  await client.db(dbName).collection('leather_suits').estimatedDocumentCount();
  return client;
}

async function testVercelBlob(token: string): Promise<boolean> {
  const blob = await put(
    `verify-tryon-prereqs-probe-${Date.now()}.png`,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    { access: 'public', addRandomSuffix: true, contentType: 'image/png', token }
  );
  await del(blob.url, { token }).catch(() => {});
  return true;
}

async function testImgBB(apiKey: string): Promise<boolean> {
  const form = new FormData();
  form.append(
    'image',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  );
  form.append('key', apiKey);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return Boolean(data?.success);
}

function printResult(ok: boolean, label: string, detail: string): boolean {
  console.log(`${ok ? '✓' : '✗'} ${label}: ${detail}`);
  return ok;
}

async function main() {
  loadEnvFromFiles();

  const mongoUri = process.env.MONGODB_URI?.trim() || '';
  const mongoDb = process.env.MONGODB_DB?.trim() || '';
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim() || '';
  const imgbbKey = process.env.IMGBB_API_KEY?.trim() || '';
  const internalSecret = process.env.CAMERA_TRYON_INTERNAL_SECRET?.trim() || '';
  const appUrl = getConfiguredSiteUrl();

  const checks: boolean[] = [];

  checks.push(printResult(Boolean(mongoUri), 'MONGODB_URI', mongoUri ? 'configured' : 'missing'));
  checks.push(printResult(Boolean(mongoDb), 'MONGODB_DB', mongoDb || 'missing'));
  checks.push(
    printResult(Boolean(blobToken), 'BLOB_READ_WRITE_TOKEN', blobToken ? 'configured' : 'missing')
  );
  if (imgbbKey) {
    printResult(true, 'IMGBB_API_KEY', 'configured (best-effort mirror, optional)');
  } else {
    console.log('○ IMGBB_API_KEY: not set (optional -- best-effort mirror only, try-on still works without it)');
  }
  checks.push(
    printResult(
      Boolean(internalSecret),
      'CAMERA_TRYON_INTERNAL_SECRET',
      internalSecret ? 'configured' : 'missing'
    )
  );
  checks.push(
    printResult(
      Boolean(appUrl),
      'Completion callback URL',
      `${appUrl.replace(/\/$/, '')}/api/internal/tryon/complete`
    )
  );

  let client: MongoClient | null = null;

  try {
    if (mongoUri && mongoDb) {
      client = await testMongo(mongoUri, mongoDb);
      checks.push(printResult(true, 'MongoDB Atlas', `connected to database \`${mongoDb}\``));

      const db = client.db(mongoDb);
      const activeSuitCount = await db.collection('leather_suits').countDocuments({ active: true });
      checks.push(
        printResult(
          activeSuitCount > 0,
          'Active leather suits',
          activeSuitCount > 0 ? `${activeSuitCount} active suits found` : 'no active suits found'
        )
      );
    }

    if (blobToken) {
      const ok = await testVercelBlob(blobToken).catch(() => false);
      checks.push(printResult(ok, 'Vercel Blob', ok ? 'token accepted' : 'token rejected'));
    }

    if (imgbbKey) {
      const ok = await testImgBB(imgbbKey);
      printResult(ok, 'ImgBB', ok ? 'API key accepted (mirror)' : 'API key rejected (mirror only, non-blocking)');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    checks.push(printResult(false, 'Try-on prerequisite check', message));
  } finally {
    await client?.close().catch(() => {});
  }

  const passed = checks.filter(Boolean).length;
  console.log(`\n${passed}/${checks.length} Camera-side try-on checks passed`);
  process.exitCode = passed === checks.length ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
