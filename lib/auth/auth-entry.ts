/**
 * Where to send unauthenticated users: FFF-branded login vs direct OAuth start.
 */

import { headers } from 'next/headers';
import { isFffHost } from '@/lib/site-hosts';

export async function authEntryPathForCurrentHost(): Promise<string> {
  const h = (await headers()).get('host');
  return isFffHost(h) ? '/login' : '/api/auth/login';
}
