import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import PartnerContentDefaultsEditor from '@/components/admin/PartnerContentDefaultsEditor';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type PartnerDefaultLandingPage } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { getPartnerScopedAccessForPartner, isGlobalAdminSession } from '@/lib/partners/authorization';

export default async function PartnerLandingPageDefaultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const session = await getSession();
  if (!session) redirect('/api/auth/login');
  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(id) });
  if (!partner) notFound();
  const access = await getPartnerScopedAccessForPartner(db, session, String(partner.partnerId), 'events');
  if (!access.allowed) redirect('/admin/partners');
  return <PartnerContentDefaultsEditor partnerId={id} partnerName={String(partner.name)} kind="landingPage" initial={(partner.contentDefaults?.landingPage as PartnerDefaultLandingPage | null) ?? null} canManage={isGlobalAdminSession(session) || access.role === 'manager' || access.role === 'admin'} />;
}
