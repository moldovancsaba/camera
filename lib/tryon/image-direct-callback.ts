import { isIP } from 'node:net';
import { safeEqual } from '@/lib/security/safeEqual';

const SHA256 = /^[a-f0-9]{64}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MODEL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:+/@-]{0,127}$/;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_RESULT_BYTES = 10 * 1024 * 1024;

export interface ImageDirectCompletionPayload {
  schemaVersion: 1;
  renderer: 'image_direct';
  jobId: string;
  executionId: string;
  publicResultUrl: string;
  sha256: string;
  byteLength: number;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  workerId: string;
  processorMeta: { pipelineVersion: string; modelId: string };
  idempotencyKey: string;
}

export type ImageDirectCallbackValidation =
  | { ok: true; payload: ImageDirectCompletionPayload }
  | { ok: false; code: 'invalid_callback' | 'host_not_configured' | 'result_host_rejected' };

export function validImageDirectCallbackCredential(provided: string, current?: string, previous?: string): boolean {
  return (typeof current === 'string' && current.length >= 32 && safeEqual(provided, current)) ||
    (typeof previous === 'string' && previous.length >= 32 && safeEqual(provided, previous));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resultUrlAllowed(raw: string, sha256: string, allowedHosts: string): boolean {
  const hosts = new Set(allowedHosts.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (!hosts.size) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      !hosts.has(url.hostname.toLowerCase()) || isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0 || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) return false;
  return /^\/assets\/[a-f0-9]{24}\/versions\/1\/[a-f0-9]{64}$/.test(url.pathname) && url.pathname.endsWith(`/${sha256}`);
}

export function validateImageDirectCompletion(
  value: unknown,
  allowedHosts = process.env.IMAGE_DIRECT_RESULT_ALLOWED_HOSTS ?? '',
): ImageDirectCallbackValidation {
  if (!allowedHosts.trim()) return { ok: false, code: 'host_not_configured' };
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'schemaVersion', 'renderer', 'jobId', 'executionId', 'publicResultUrl', 'sha256', 'byteLength', 'mediaType',
    'workerId', 'processorMeta', 'idempotencyKey',
  ].includes(key))) return { ok: false, code: 'invalid_callback' };
  if (value.schemaVersion !== 1 || value.renderer !== 'image_direct' || typeof value.jobId !== 'string' || !OPAQUE_ID.test(value.jobId) ||
      typeof value.executionId !== 'string' || !OPAQUE_ID.test(value.executionId) || typeof value.workerId !== 'string' || !OPAQUE_ID.test(value.workerId) ||
      typeof value.sha256 !== 'string' || !SHA256.test(value.sha256) || !Number.isSafeInteger(value.byteLength) ||
      Number(value.byteLength) < 1 || Number(value.byteLength) > MAX_RESULT_BYTES || typeof value.mediaType !== 'string' || !MIME_TYPES.has(value.mediaType) ||
      value.idempotencyKey !== `image-direct-result:${value.jobId}:v1` || typeof value.publicResultUrl !== 'string' || value.publicResultUrl.length > 2048 ||
      !isRecord(value.processorMeta) || Object.keys(value.processorMeta).some((key) => !['pipelineVersion', 'modelId'].includes(key)) ||
      typeof value.processorMeta.pipelineVersion !== 'string' || !MODEL_VERSION.test(value.processorMeta.pipelineVersion) ||
      typeof value.processorMeta.modelId !== 'string' || !MODEL_VERSION.test(value.processorMeta.modelId)) {
    return { ok: false, code: 'invalid_callback' };
  }
  if (!resultUrlAllowed(value.publicResultUrl, value.sha256, allowedHosts)) return { ok: false, code: 'result_host_rejected' };
  return { ok: true, payload: value as unknown as ImageDirectCompletionPayload };
}

export async function readBoundedRequestJson(request: Request, limit: number): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)) {
    return { ok: false, status: /^\d+$/.test(declaredLength) ? 413 : 400 };
  }
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
  if (!size) return { ok: false, status: 400 };
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}
