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
    <div className="p-8">
      <Link href="/admin/gym" className="text-sm text-gray-600 hover:underline dark:text-gray-400">
        ← Gym hub
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">FunFitFan (FFF)</h1>
      <p className="mt-2 max-w-2xl text-gray-600 dark:text-gray-400">
        Members get a virtual Camera <strong>event</strong> under the <code className="text-xs">FunFitFan</code>{' '}
        partner. Each log is a <strong>submission</strong> to that event with a framed selfie and activity text.
        Their <strong>slideshow</strong> uses the standard player (default loop, {3000 / 1000}s slide timing from
        bootstrap).
      </p>

      {dbError != null ? <DatabaseConnectionAlert error={dbError} /> : null}

      {!dbError && (
        <div className="mt-8 space-y-12">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Default frame</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              This frame is synced to the FunFitFan partner defaults and rolled out to child events that inherit
              frames.
            </p>
            <div className="mt-4">
              <AdminFffFrameForm frames={frames} currentFrameId={currentFrameId} />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sport activities</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Members pick one activity from this list when logging a check-in. The list is stored in MongoDB
              (`fff_settings.sportActivities`); an initial set is written automatically when the field is empty.
            </p>
            <div className="mt-4">
              <AdminFffActivitiesForm initialLines={sportActivities} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
