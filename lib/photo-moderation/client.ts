import 'server-only';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { blobStoreHostFromToken } from '@/lib/submissions/original-image';
import type { ModerationConfiguration } from './config';

export { DEFAULT_MODERATION_BASE_URL, moderationConfiguration, type ModerationConfiguration } from './config';

export const MODERATION_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const MODERATION_MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const MODERATION_MAX_PIXELS = 16_000_000;

export type RemoteJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export interface RemoteModerationJob {
  id: string;
  status: RemoteJobStatus;
  result?: unknown;
  errorCode?: string;
  imageSha256?: string;
  normalizedSha256?: string;
}

export class ModerationServiceError extends Error {
  constructor(readonly code: string, readonly status: number | null, readonly retryAfterSeconds?: number) {
    super(code);
    this.name = 'ModerationServiceError';
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.min(300, Math.max(1, Math.ceil(seconds)));
}

export class CameraModerationClient {
  constructor(
    private readonly configuration: ModerationConfiguration,
    private readonly fetcher: typeof fetch = fetch,
    private readonly requestPurpose: 'test' | undefined = process.env.VERCEL_ENV === 'preview' ? 'test' : undefined,
  ) {}

  private async request(
    path: string,
    init: RequestInit = {},
    options: { allowEmptyBody?: boolean; allowExpiredJob?: boolean } = {},
  ): Promise<{ response: Response; body: Record<string, unknown> }> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.configuration.baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.configuration.apiKey}`,
          ...(this.requestPurpose ? { 'X-Request-Purpose': this.requestPurpose } : {}),
          ...(init.headers ?? {}),
        },
        signal: init.signal ?? AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ModerationServiceError('network_or_timeout', null);
    }
    const acceptedExpiredJob = options.allowExpiredJob === true && response.status === 404;
    const body = object(await response.json().catch(() => null));
    if (!response.ok && !acceptedExpiredJob) {
      const code = response.status === 429 ? 'capacity_busy'
        : response.status === 401 ? 'unauthorized'
          : response.status === 403 ? 'task_not_permitted'
            : response.status === 404 ? 'job_missing_or_expired'
              : response.status === 409 ? 'idempotency_conflict'
                : response.status === 400 || response.status === 413 || response.status === 415 ? 'invalid_request'
                  : response.status >= 500 ? 'service_unavailable'
                    : 'request_failed';
      throw new ModerationServiceError(code, response.status, retryAfter(response));
    }
    if (!body && !options.allowEmptyBody) throw new ModerationServiceError('invalid_response', response.status);
    return { response, body: body ?? {} };
  }

  /** Read both allow-list and installed/selectable model inventory before the first task is submitted. */
  async discover(): Promise<void> {
    const tasks = await this.request('/job-types');
    const taskMap = object(tasks.body.job_types);
    if (!taskMap || !object(taskMap.image_moderation)) throw new ModerationServiceError('image_moderation_not_permitted', tasks.response.status);
    const inventory = await this.request('/models');
    // The shared job router returns its OpenAI-compatible model list in `data`;
    // accept the earlier `models` envelope as a backwards-compatible shape.
    const entries = Array.isArray(inventory.body.data)
      ? inventory.body.data
      : Array.isArray(inventory.body.models) ? inventory.body.models : null;
    if (!entries) throw new ModerationServiceError('model_inventory_invalid', inventory.response.status);
    const selectable = entries.some((entry) => {
      const model = object(entry);
      return Array.isArray(model?.selectable_for) && model!.selectable_for.includes('image_moderation') && typeof model?.id === 'string';
    });
    if (!selectable) throw new ModerationServiceError('no_moderation_model_selectable', inventory.response.status);
  }

  async submit(image: Buffer, idempotencyKey: string, signal?: AbortSignal): Promise<string> {
    const result = await this.request('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ task: 'image_moderation', model: 'auto', input: { image_base64: image.toString('base64') } }),
      ...(signal ? { signal } : {}),
    });
    if (result.response.status !== 202 || typeof result.body.id !== 'string' || !result.body.id || result.body.id.length > 200) {
      // A successful but malformed response may follow an accepted POST. Keep
      // the idempotency key and reconcile that same request; don't open a
      // second Camera job because its first job ID was missing.
      throw new ModerationServiceError('invalid_job_submission_response', null);
    }
    return result.body.id;
  }

  async read(jobId: string, signal?: AbortSignal): Promise<RemoteModerationJob> {
    if (!jobId || jobId.length > 200) throw new ModerationServiceError('invalid_job_id', null);
    const result = await this.request(`/jobs/${encodeURIComponent(jobId)}`, signal ? { signal } : {});
    const status = result.body.status;
    if (result.body.id !== jobId || (status !== 'queued' && status !== 'running' && status !== 'completed' && status !== 'failed')) {
      throw new ModerationServiceError('invalid_job_status_response', result.response.status);
    }
    const error = object(result.body.error);
    return {
      id: jobId,
      status,
      ...(status === 'completed' ? { result: result.body.result } : {}),
      ...(typeof result.body.image_sha256 === 'string' ? { imageSha256: result.body.image_sha256 } : {}),
      ...(typeof result.body.normalized_sha256 === 'string' ? { normalizedSha256: result.body.normalized_sha256 } : {}),
      ...(typeof error?.code === 'string' ? { errorCode: error.code.slice(0, 80) } : {}),
    };
  }

  /** Remove a consumed remote result; a 404 means the five-minute result TTL already removed it. */
  async delete(jobId: string, signal?: AbortSignal): Promise<void> {
    if (!jobId || jobId.length > 200) throw new ModerationServiceError('invalid_job_id', null);
    await this.request(`/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      ...(signal ? { signal } : {}),
    }, { allowEmptyBody: true, allowExpiredJob: true });
  }
}

/** Accept only Camera's own pending Blob URL for this event; the remote API receives bytes, never the URL. */
export function isCameraPendingPhotoUrl(value: unknown, eventMongoId: string, blobToken: string | undefined): value is string {
  if (typeof value !== 'string') return false;
  const ownHost = blobStoreHostFromToken(blobToken);
  if (!ownHost || !/^[a-f\d]{24}$/i.test(eventMongoId)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.host.toLowerCase() !== ownHost.toLowerCase() || url.username || url.password || url.search || url.hash) return false;
    const pathname = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return new RegExp(`^pending/${eventMongoId}/[a-f\\d]{24}(?:-[A-Za-z0-9]+)?\\.(?:jpg|png|webp)(?:-[A-Za-z0-9]+)?$`, 'i').test(pathname);
  } catch {
    return false;
  }
}

export interface NormalizedModerationImage {
  bytes: Buffer;
  sourceRevision: string;
  normalizedRevision: string;
}

/** Download a trusted pending photo with strict bounds, orient/resize/strip metadata, and hash both revisions. */
export async function loadModerationImage(
  url: string,
  eventMongoId: string,
  options: { blobToken?: string; fetcher?: typeof fetch } = {},
): Promise<NormalizedModerationImage> {
  if (!isCameraPendingPhotoUrl(url, eventMongoId, options.blobToken)) throw new ModerationServiceError('source_url_not_owned', null);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new ModerationServiceError('source_download_failed', null);
  }
  if (!response.ok) throw new ModerationServiceError('source_download_failed', response.status);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MODERATION_MAX_SOURCE_BYTES) throw new ModerationServiceError('source_too_large', response.status);
  const reader = response.body?.getReader();
  if (!reader) throw new ModerationServiceError('source_download_failed', response.status);
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MODERATION_MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new ModerationServiceError('source_too_large', response.status);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ModerationServiceError) throw error;
    throw new ModerationServiceError('source_download_failed', response.status);
  }
  const source = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
  if (source.length === 0 || source.length > MODERATION_MAX_SOURCE_BYTES) throw new ModerationServiceError('source_too_large', response.status);

  const sourceRevision = createHash('sha256').update(source).digest('hex');
  let normalized: Buffer;
  try {
    const image = sharp(source, { limitInputPixels: MODERATION_MAX_PIXELS, failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) throw new ModerationServiceError('unsupported_source_format', null);
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MODERATION_MAX_PIXELS) throw new ModerationServiceError('source_dimensions_invalid', null);
    normalized = await image.rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } }).jpeg({ quality: 82 }).toBuffer();
  } catch (error) {
    if (error instanceof ModerationServiceError) throw error;
    throw new ModerationServiceError('source_decode_failed', null);
  }
  if (normalized.length === 0 || normalized.length > MODERATION_MAX_INPUT_BYTES) throw new ModerationServiceError('normalized_image_too_large', null);
  return { bytes: normalized, sourceRevision, normalizedRevision: createHash('sha256').update(normalized).digest('hex') };
}
