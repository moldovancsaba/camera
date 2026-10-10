/**
 * Sample selfies (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the general selfies that fill the photo window of the welcome page screen for every event that has nothing of its own. The
 * active ones are the default of every partner, which follows them until it chooses or uploads its own; its events follow the partner. Global admins only.
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import SampleSelfiesLibrary from '@/components/admin/library/SampleSelfiesLibrary';

export const dynamic = 'force-dynamic';

export default async function SampleSelfiesPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }
  return <SampleSelfiesLibrary />;
}
