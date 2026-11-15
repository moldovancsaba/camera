import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import PartnerContentDefaultsEditor from '@/components/admin/PartnerContentDefaultsEditor';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS, type PartnerDefaultSlideshow } from '@/lib/db/schemas';
import { getSession } from '@/lib/auth/session';
import { getPartnerScopedAccessForPartner, isGlobalAdminSession } from '@/lib/partners/authorization';
import { normalizeParentSlideshowTemplates } from '@/lib/slideshow/parent-templates';

export default async function PartnerSlideshowDefaultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const session = await getSession();
  if (!session) redirect('/api/auth/login');
  const db = await connectToDatabase();
  const partner = await db.collection(COLLECTIONS.PARTNERS).findOne({ _id: new ObjectId(id) });
  if (!partner) notFound();
  const access = await getPartnerScopedAccessForPartner(db, session, String(partner.partnerId), 'events');
  if (!access.allowed) redirect('/admin/partners');
  const globalDefaults = await db.collection(COLLECTIONS.ADMIN_SETTINGS).findOne(
    { settingId: 'global-content-defaults' },
    { projection: { slideshow: 1, slideshowTemplates: 1, defaultSlideshowTemplateId: 1, revision: 1 } },
  );
  const partnerState = normalizeParentSlideshowTemplates(
    partner.contentDefaults as Record<string, unknown> | null,
    `legacy-partner-slideshow-${id}`,
    false,
  );
  const globalState = normalizeParentSlideshowTemplates(
    globalDefaults as Record<string, unknown> | null,
    'legacy-global-slideshow',
    true,
  );
  return (
    <PartnerContentDefaultsEditor
      partnerId={id}
      partnerName={String(partner.name)}
      kind="slideshow"
      initial={partnerState.slideshow as PartnerDefaultSlideshow | null}
      canManage={isGlobalAdminSession(session) || access.role === 'manager' || access.role === 'admin'}
      slideshowTemplates={partnerState.slideshowTemplates}
      defaultSlideshowTemplateId={partnerState.defaultSlideshowTemplateId}
      slideshowRevision={partnerState.revision}
      inheritedSlideshow={globalState.slideshow}
    />
  );
}
