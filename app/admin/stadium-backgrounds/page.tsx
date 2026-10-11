/**
 * Stadium backgrounds (issue 326, docs/SCREEN_DESIGN.md): the general pictures the stage of an event's default slideshow is drawn on, with the event's colours over them. The active ones are the
 * default of every partner, which follows them until it chooses or uploads its own; its events follow the partner. Global admins only.
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import StadiumBackgroundsLibrary from '@/components/admin/library/StadiumBackgroundsLibrary';

export const dynamic = 'force-dynamic';

export default async function StadiumBackgroundsPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }
  return <StadiumBackgroundsLibrary />;
}
