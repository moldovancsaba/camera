import { fetchBounded, logOutbound } from '@/lib/observability/outbound';

export const PRIVACY_SUBJECT_TOKEN_TIMEOUT_MS = 5_000;
export const PRIVACY_SUBJECT_PROOF_TIMEOUT_MS = 5_000;
const PRIVACY_RESOLVER_SCOPE = 'sso:privacy.resolve';

type CachedToken = { value: string; expiresAt: number };
let tokenCache: CachedToken | null = null;
let tokenRequest: Promise<CachedToken> | null = null;

export interface SsoSubjectProof {
  version: 1;
  caseId: string;
  subject: { kind: 'sso_user' | 'camera_photo'; id: string };
  verifiedEmail?: { value: string; proof: 'sso_account_email_verified'; verifiedAt: string | null };
}

export class PrivacySubjectProofError extends Error {
  constructor(readonly kind: 'invalid' | 'unavailable') {
    super(kind === 'invalid' ? 'privacy_subject_proof_invalid' : 'privacy_subject_proof_unavailable');
    this.name = 'PrivacySubjectProofError';
  }
}

function serviceConfig(): { baseUrl: string; clientId: string; clientSecret: string } {
  const baseValue = process.env.SSO_BASE_URL?.trim();
  const clientId = process.env.SSO_PRIVACY_RESOLVER_CLIENT_ID?.trim();
  const clientSecret = process.env.SSO_PRIVACY_RESOLVER_CLIENT_SECRET?.trim();
  if (!baseValue || !clientId || !clientSecret) throw new PrivacySubjectProofError('unavailable');

  let base: URL;
  try {
    base = new URL(baseValue);
  } catch {
    throw new PrivacySubjectProofError('unavailable');
  }
  if ((process.env.NODE_ENV === 'production' && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new PrivacySubjectProofError('unavailable');
  }
  return { baseUrl: base.origin, clientId, clientSecret };
}

async function getServiceToken(): Promise<CachedToken> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 10_000) return tokenCache;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const { baseUrl, clientId, clientSecret } = serviceConfig();
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: PRIVACY_RESOLVER_SCOPE,
    });
    let response: Response;
    try {
      response = await fetchBounded(
        'privacy.subject_proof.token',
        'SSO privacy resolver token',
        new URL('/api/oauth/token', baseUrl).href,
        { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form.toString(), cache: 'no-store' },
        PRIVACY_SUBJECT_TOKEN_TIMEOUT_MS
      );
    } catch {
      throw new PrivacySubjectProofError('unavailable');
    }
    logOutbound('privacy.subject_proof.token', response.ok ? 'ok' : 'refused', { status: response.status, timeoutMs: PRIVACY_SUBJECT_TOKEN_TIMEOUT_MS });
    if (!response.ok) throw new PrivacySubjectProofError('unavailable');

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new PrivacySubjectProofError('unavailable');
    }
    const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const accessToken = typeof row.access_token === 'string' ? row.access_token : '';
    const expiresIn = Number(row.expires_in);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn < 1) throw new PrivacySubjectProofError('unavailable');

    const cached = { value: accessToken, expiresAt: Date.now() + Math.min(expiresIn, 3_600) * 1_000 };
    tokenCache = cached;
    return cached;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidProof(value: unknown, expectedCaseId: string): value is SsoSubjectProof {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proof = value as Record<string, unknown>;
  if (proof.version !== 1 || proof.caseId !== expectedCaseId || !proof.subject || typeof proof.subject !== 'object' || Array.isArray(proof.subject)) return false;
  const subject = proof.subject as Record<string, unknown>;
  if ((subject.kind !== 'sso_user' && subject.kind !== 'camera_photo') || typeof subject.id !== 'string' || !subject.id.trim() || subject.id.length > 256 || /[\u0000-\u001f]/.test(subject.id)) return false;
  if (subject.kind === 'camera_photo' && !/^[A-Za-z0-9_-]{1,128}$/.test(subject.id)) return false;
  if (!isUuid(expectedCaseId)) return false;
  if (proof.verifiedEmail !== undefined) {
    if (!proof.verifiedEmail || typeof proof.verifiedEmail !== 'object' || Array.isArray(proof.verifiedEmail)) return false;
    const email = proof.verifiedEmail as Record<string, unknown>;
    if (typeof email.value !== 'string' || email.proof !== 'sso_account_email_verified' || !(email.verifiedAt === null || typeof email.verifiedAt === 'string')) return false;
  }
  return true;
}

/** Fetch the proof from SSO; no caller-supplied identity field is accepted. */
export async function getSsoPrivacySubjectProof(caseId: string): Promise<SsoSubjectProof> {
  const { baseUrl } = serviceConfig();
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getServiceToken();
    let response: Response;
    try {
      response = await fetchBounded(
        'privacy.subject_proof.read',
        'SSO privacy subject proof',
        new URL(`/api/internal/privacy/requests/${encodeURIComponent(caseId)}?includeSubject=true`, baseUrl).href,
        { method: 'GET', headers: { authorization: `Bearer ${token.value}`, accept: 'application/json' }, cache: 'no-store' },
        PRIVACY_SUBJECT_PROOF_TIMEOUT_MS
      );
    } catch {
      throw new PrivacySubjectProofError('unavailable');
    }

    if ((response.status === 401 || response.status === 403) && attempt === 0) {
      tokenCache = null;
      continue;
    }
    logOutbound('privacy.subject_proof.read', response.ok ? 'ok' : 'refused', { status: response.status, timeoutMs: PRIVACY_SUBJECT_PROOF_TIMEOUT_MS });
    if (response.status === 404 || response.status === 409) throw new PrivacySubjectProofError('invalid');
    if (!response.ok) throw new PrivacySubjectProofError('unavailable');

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new PrivacySubjectProofError('unavailable');
    }
    const envelope = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const caseData = envelope.case && typeof envelope.case === 'object' ? envelope.case as Record<string, unknown> : {};
    if (!envelope.success || !isValidProof(caseData.subjectProof, caseId)) throw new PrivacySubjectProofError('invalid');
    return caseData.subjectProof;
  }
  throw new PrivacySubjectProofError('unavailable');
}

/** Test-only cache reset, preventing one mocked SSO response leaking into another case. */
export function resetPrivacySubjectTokenCache(): void {
  tokenCache = null;
  tokenRequest = null;
}
