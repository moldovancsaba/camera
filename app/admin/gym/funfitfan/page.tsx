/**
 * FunFitFan admin: default frame for all FFF flows (partner + per-user virtual events).
 */

import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import { readFunFitFanDefaultFrameId, readFunFitFanSportActivities } from '@/lib/funfitfan/bootstrap';
import DatabaseConnectionAlert from '@/components/admin/DatabaseConnectionAlert';
import Link from 'next/link';
import AdminFffFrameForm from '@/components/funfitfan/AdminFffFrameForm';
import AdminFffActivitiesForm from '@/components/funfitfan/AdminFffActivitiesForm';

export default async function AdminFunFitFanPage() {
  let frames: { frameId: string; name: string }[] = [];
  let currentFrameId = '';
  let sportActivities: string[] = [];
  let dbError: unknown = null;

  try {
    const db = await connectToDatabase();
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
        ← Gym hub
      </Link>
      <h1 className="app-panel-title">FunFitFan (FFF)</h1>
      <p className="app-panel-lede">
        Members get a virtual Camera <strong>event</strong> under the <code>FunFitFan</code> partner. Each log is a{' '}
        <strong>submission</strong> to that event with a framed selfie and activity text. Their{' '}
        <strong>slideshow</strong> uses the standard player (default loop, {3000 / 1000}s slide timing from
        bootstrap).
      </p>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && (
        <div className="app-panel-stack">
          <div>
            <h2 className="app-panel-section-title">Default frame</h2>
            <p className="app-panel-section-lede">
              This frame is synced to the FunFitFan partner defaults and rolled out to child events that inherit
              frames.
            </p>
            <div className="app-panel-block">
              <AdminFffFrameForm frames={frames} currentFrameId={currentFrameId} />
            </div>
          </div>
          <div>
            <h2 className="app-panel-section-title">Sport activities</h2>
            <p className="app-panel-section-lede">
              Members pick one activity from this list when logging a check-in. The list is stored in MongoDB
              (`fff_settings.sportActivities`); an initial set is written automatically when the field is empty.
            </p>
            <div className="app-panel-block">
              <AdminFffActivitiesForm initialLines={sportActivities} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
