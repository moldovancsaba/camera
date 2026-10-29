/**
 * QR texts (issue 326, docs/SCREEN_DESIGN.md): the short lines next to the QR code on the stage of an event's default slideshow. A random active one in the event's language is picked, once, when
 * the event's default slideshow is made. Global admins only.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function QrTextsPage() {
  redirect('/admin/dictionary');
}
