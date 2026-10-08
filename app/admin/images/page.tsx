/**
 * Global Images (camera#368, docs/LIBRARIES.md): the images the global admins collect for every partner to take into its own library.
 * `?scope=all` also lists what partners and events uploaded for themselves. Global admins only.
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import GlobalImagesLibrary from '@/components/admin/library/GlobalImagesLibrary';

export const dynamic = 'force-dynamic';

export default async function GlobalImagesPage({ searchParams }: { searchParams?: Promise<{ scope?: string }> }) {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }
  const resolved = searchParams ? await searchParams : {};
  return <GlobalImagesLibrary showAll={resolved?.scope === 'all'} />;
}
