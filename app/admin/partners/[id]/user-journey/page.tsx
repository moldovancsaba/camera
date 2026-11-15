import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { Anchor, Breadcrumbs, Text } from '@/components/gds/PublicPrimitives';
import AdminEditorScaffold from '@/components/admin/AdminEditorScaffold';
import ExperienceTemplateDefaultSettings from '@/components/admin/ExperienceTemplateDefaultSettings';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { getPartnerScopedAccessForPartner, isGlobalAdminSession } from '@/lib/partners/authorization';

export const dynamic = 'force-dynamic';

export default async function PartnerUserJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const session = await getSession();
  if (!session) redirect('/api/auth/login');

  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne(
    { _id: new ObjectId(id) },
    { projection: { _id: 1, partnerId: 1, name: 1 } },
  );
  if (!partner) notFound();

  const access = await getPartnerScopedAccessForPartner(db, session, String(partner.partnerId), 'events');
  if (!access.allowed) redirect('/admin/partners');
  const canManage = isGlobalAdminSession(session) || access.role === 'manager' || access.role === 'admin';

  const firstEvent = await db.collection(COLLECTIONS.EVENTS)
    .find({ partnerId: String(partner.partnerId) }, { projection: { _id: 1 } })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  const partnerName = String(partner.name ?? 'Partner');
  return (
    <AdminEditorScaffold
      eyebrow="Partners"
      title={`${partnerName} — Partner User Journey`}
      description="Choose the partner’s default guest journey. Events follow it until they select an Event Journey of their own."
      maxWidth="100%"
      breadcrumbs={(
        <Breadcrumbs>
          <Anchor href="/admin/partners" size="sm">Partners</Anchor>
          <Anchor href={`/admin/partners/${id}`} size="sm">{partnerName}</Anchor>
          <Text size="sm">Partner User Journey</Text>
        </Breadcrumbs>
      )}
    >
      <ExperienceTemplateDefaultSettings
        level="partner"
        resourceId={id}
        sourceEventId={firstEvent?._id instanceof ObjectId ? String(firstEvent._id) : undefined}
        canManage={canManage}
      />
    </AdminEditorScaffold>
  );
}
