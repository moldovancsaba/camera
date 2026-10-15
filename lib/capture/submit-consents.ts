import type { ConsentRecord } from '@/lib/events/consent';

type ConsentFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Persist consent remembered before SSO before the resumed journey advances beyond the login page. */
export async function appendSubmissionConsents(
  fetcher: ConsentFetch,
  submissionId: string,
  consents: readonly ConsentRecord[],
): Promise<boolean> {
  if (consents.length === 0) return true;
  try {
    const response = await fetcher(`/api/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'append_consents', consents }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
