/**
 * Verify Camera-side try-on prerequisites.
 *
 * Usage:
 *   npx tsx scripts/verify-tryon-prereqs.ts
 */

import { MongoClient } from 'mongodb';
import { loadEnvFromFiles } from './load-env-from-files';

async function testMongo(uri: string, dbName: string): Promise<MongoClient> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  await client.db(dbName).collection('leather_suits').estimatedDocumentCount();
  return client;
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
  const imgbbKey = process.env.IMGBB_API_KEY?.trim() || '';
  const internalSecret = process.env.CAMERA_TRYON_INTERNAL_SECRET?.trim() || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';

  const checks: boolean[] = [];

  checks.push(printResult(Boolean(mongoUri), 'MONGODB_URI', mongoUri ? 'configured' : 'missing'));
  checks.push(printResult(Boolean(mongoDb), 'MONGODB_DB', mongoDb || 'missing'));
  checks.push(
    printResult(Boolean(imgbbKey), 'IMGBB_API_KEY', imgbbKey ? 'configured' : 'missing')
  );
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

    if (imgbbKey) {
      const ok = await testImgBB(imgbbKey);
      checks.push(printResult(ok, 'ImgBB', ok ? 'API key accepted' : 'API key rejected'));
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
