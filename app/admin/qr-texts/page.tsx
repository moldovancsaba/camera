/**
 * QR texts (issue 326, docs/SCREEN_DESIGN.md): the short lines next to the QR code on the stage of an event's default slideshow. A random active one in the event's language is picked, once, when
 * the event's default slideshow is made. Global admins only.
 */

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isGlobalAdminSession } from '@/lib/partners/authorization';
import QrTextsLibrary from '@/components/admin/library/QrTextsLibrary';

export const dynamic = 'force-dynamic';

export default async function QrTextsPage() {
  const session = await getSession();
  if (!isGlobalAdminSession(session)) {
    redirect('/admin/partners');
  }
  return <QrTextsLibrary />;
}
