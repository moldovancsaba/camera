/**
 * Gym selfie: reuses CameraCapture + imgbb via /api/gym/sessions/:id/selfie
 */

import { getSession } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';
import GymSelfieClient from '@/components/gym/GymSelfieClient';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function GymSelfiePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect('/api/auth/login');
  }

  const { sessionId } = await params;
  const db = await connectToDatabase();
  const row = await db.collection(COLLECTIONS.GYM_WORKOUT_SESSIONS).findOne({ sessionId });
  if (!row || row.userId !== session.user.id) {
    notFound();
  }

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        <Link href={`/gym/session/${sessionId}`} className="text-blue-600 hover:underline dark:text-blue-400">
          ← Back to session
        </Link>
      </p>
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Gym selfie</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Uses the same in-browser camera as photo capture; image is stored on imgbb and linked to this workout.
      </p>
      <div className="mt-6">
        <GymSelfieClient sessionId={sessionId} />
      </div>
    </div>
  );
}
