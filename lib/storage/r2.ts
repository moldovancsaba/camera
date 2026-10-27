/** Server-only access to Camera's private Cloudflare R2 backup bucket. */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export interface R2Settings {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  jurisdiction: string;
}

function settings(): R2Settings {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? '';
  const bucket = process.env.R2_PRIVATE_BUCKET?.trim() ?? '';
  const jurisdiction = process.env.R2_JURISDICTION?.trim().toLowerCase() ?? '';
  if (![accountId, accessKeyId, secretAccessKey, bucket].every(Boolean)
    || !/^[a-f0-9]{32}$/i.test(accountId)
    || !/^[a-z0-9-]{3,63}$/.test(bucket)
    || jurisdiction !== 'eu') {
    throw new Error('Cloudflare R2 backup storage is not configured');
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, jurisdiction };
}

let cachedClient: { identity: string; client: S3Client } | null = null;

function client(): { client: S3Client; bucket: string } {
  const config = settings();
  const identity = `${config.accountId}\n${config.accessKeyId}\n${config.secretAccessKey}\n${config.bucket}\n${config.jurisdiction}`;
  if (!cachedClient || cachedClient.identity !== identity) {
    cachedClient?.client.destroy();
    cachedClient = {
      identity,
      client: new S3Client({
        region: 'auto',
        // R2 buckets with an EU jurisdiction require the EU-specific endpoint.
        endpoint: `https://${config.accountId}${config.jurisdiction === 'default' ? '' : `.${config.jurisdiction}`}.r2.cloudflarestorage.com`,
        forcePathStyle: true,
        maxAttempts: 2,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      }),
    };
  }
  return { client: cachedClient.client, bucket: config.bucket };
}

/** Keys are content-addressed and scoped to one event/submission; reject arbitrary deletion paths. */
export function isCameraOriginalR2Key(value: unknown): value is string {
  return typeof value === 'string'
    && /^camera\/originals\/[A-Za-z0-9_-]{1,64}\/[A-Fa-f0-9]{24}\/[a-f0-9]{64}\.jpg$/.test(value);
}

export async function putVerifiedOriginalR2Copy(input: {
  key: string;
  bytes: Buffer;
  sha256: string;
}): Promise<void> {
  if (!isCameraOriginalR2Key(input.key)) throw new Error('Invalid Camera original R2 object key');
  const { client: s3, bucket } = client();
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    Body: input.bytes,
    ContentLength: input.bytes.byteLength,
    ContentType: 'image/jpeg',
    CacheControl: 'private, no-store',
    Metadata: { sha256: input.sha256 },
  }), { abortSignal: AbortSignal.timeout(45_000) });

  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: input.key }), { abortSignal: AbortSignal.timeout(30_000) });
  if (!response.Body) throw new Error('R2 original read-back returned no body');
  const stored = Buffer.from(await response.Body.transformToByteArray());
  const digest = createHash('sha256').update(stored).digest('hex');
  if (stored.byteLength !== input.bytes.byteLength || digest !== input.sha256) {
    throw new Error('R2 original read-back did not match the uploaded file');
  }
}

export async function deleteCameraOriginalR2Copy(key: string): Promise<void> {
  if (!isCameraOriginalR2Key(key)) throw new Error('Invalid Camera original R2 object key');
  const { client: s3, bucket } = client();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(20_000) });
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
    throw new Error('R2 original still exists after delete');
  } catch (error) {
    if (error instanceof Error && error.message === 'R2 original still exists after delete') throw error;
    const name = error && typeof error === 'object' ? String((error as { name?: unknown }).name ?? '') : '';
    const status = error && typeof error === 'object' ? Number((error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode) : 0;
    if (name !== 'NotFound' && status !== 404) throw error;
  }
}

export async function cameraOriginalR2CopyExists(key: string): Promise<boolean> {
  if (!isCameraOriginalR2Key(key)) throw new Error('Invalid Camera original R2 object key');
  const { client: s3, bucket } = client();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(15_000) });
    return true;
  } catch (error) {
    const name = error && typeof error === 'object' ? String((error as { name?: unknown }).name ?? '') : '';
    const status = error && typeof error === 'object' ? Number((error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode) : 0;
    if (name === 'NotFound' || status === 404) return false;
    throw error;
  }
}
