export function authLoginPath(returnPath?: string): string {
  const base = '/api/auth/login';
  const normalized = returnPath?.trim();
  if (!normalized) {
    return base;
  }
  return `${base}?${new URLSearchParams({ redirectTo: normalized }).toString()}`;
}

export async function authEntryPathForCurrentHost(returnPath?: string): Promise<string> {
  return authLoginPath(returnPath);
}
