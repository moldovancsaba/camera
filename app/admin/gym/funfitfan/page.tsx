/**
 * Gym admin settings: default frame and activity options for the current member experience.
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { getSession } from '@/lib/auth/session';
import { COLLECTIONS } from '@/lib/db/schemas';
import { readFunFitFanDefaultFrameId, readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';
import { FUNFITFAN_PARTNER_ID } from '@/lib/funfitfan/constants';
import { getPartnerScopedAccessForPartner, isGlobalAdminSession } from '@/lib/partners/authorization';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import AdminFffFrameForm from '@/components/funfitfan/AdminFffFrameForm';
import AdminFffActivitiesForm from '@/components/funfitfan/AdminFffActivitiesForm';
import { redirect } from 'next/navigation';

export default async function AdminGymSettingsPage() {
  const session = await getSession();
  let frames: { frameId: string; name: string }[] = [];
  let currentFrameId = '';
  let sportActivities: string[] = [];
  let dbError: unknown = null;
  let canManageGym = isGlobalAdminSession(session);

  try {
    const db = await connectToDatabase();
    const viewerAccess = await getPartnerScopedAccessForPartner(db, session!, FUNFITFAN_PARTNER_ID, 'gym');
    if (!viewerAccess.allowed) {
      redirect('/admin/partners');
    }
    if (!canManageGym) {
      canManageGym = (await getPartnerScopedAccessForPartner(db, session!, FUNFITFAN_PARTNER_ID, 'gym', 'manager')).allowed;
    }
    currentFrameId = (await readFunFitFanDefaultFrameId(db)) ?? '';
    sportActivities = await readFunFitFanSportActivities(db);

    const list = await db
      .collection(COLLECTIONS.FRAMES)
      .find({ isActive: true })
      .sort({ updatedAt: -1 })
      .limit(300)
      .toArray();
    frames = list.map((f) => ({
      frameId: f.frameId as string,
      name: (f.name as string) || f.frameId,
    }));
  } catch (e) {
    dbError = e;
  }

  return (
    <div className="app-panel-shell">
      <Link href="/admin/gym" className="app-panel-back">
        ← Gym App
      </Link>
      <h1 className="app-panel-title">Gym Settings</h1>
      <p className="app-panel-lede">
        The current Gym member experience runs on Camera Core resources. Members get a virtual Camera{' '}
        <strong>event</strong>, each log becomes a <strong>submission</strong> with a framed selfie and activity text,
        and the member history view uses the standard slideshow player.
      </p>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && (
        <div className="app-panel-stack">
          <div>
            <h2 className="app-panel-section-title">Default frame</h2>
            <p className="app-panel-section-lede">
              This frame is synced to the Gym partner defaults and rolled out to child events that inherit
              frames.
            </p>
            <div className="app-panel-block">
              <AdminFffFrameForm frames={frames} currentFrameId={currentFrameId} canManage={canManageGym} />
            </div>
          </div>
          <div>
            <h2 className="app-panel-section-title">Sport activities</h2>
            <p className="app-panel-section-lede">
              Members pick one activity from this list when logging a check-in. The list is stored in MongoDB
              (`fff_settings.sportActivities`); an initial set is written automatically when the field is empty.
            </p>
            <div className="app-panel-block">
              <AdminFffActivitiesForm initialLines={sportActivities} canManage={canManageGym} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
