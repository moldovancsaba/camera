/**
 * FunFitFan landing (PWA install uses manifest under /fff on this origin).
 */

import Link from 'next/link';
import { defaultCameraOrigin } from '@/lib/site-hosts';

export const dynamic = 'force-dynamic';

export default function FunFitFanLandingPage() {
  const cameraUrl = defaultCameraOrigin();

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex max-w-lg flex-col px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">FFF</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">FunFitFan</h1>
        <p className="mt-4 text-lg text-slate-300">
          Your workouts and gym check-ins on the same account as our Camera experiences when you need a
          framed photo.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/fff/log"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 px-6 py-3 text-center font-semibold text-emerald-950 shadow-lg shadow-emerald-900/40 transition hover:brightness-110"
          >
            Log activity + selfie
          </Link>
          <Link
            href="/fff/reel"
            className="inline-flex items-center justify-center rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-6 py-3 text-center font-semibold text-emerald-100 backdrop-blur transition hover:bg-emerald-900/50"
          >
            My reel (slideshow)
          </Link>
          <Link
            href="/gym"
            className="inline-flex items-center justify-center rounded-xl bg-slate-800 px-6 py-3 text-center font-semibold text-slate-100 transition hover:bg-slate-700"
          >
            Gym lessons
          </Link>
          <a
            href={cameraUrl}
            className="inline-flex items-center justify-center rounded-xl border border-slate-600 px-6 py-3 text-center font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/50"
          >
            Camera frames →
          </a>
        </div>

        <p className="mt-12 text-sm text-slate-500">
          Add to Home Screen: use your browser menu on mobile to install this site as an app (PWA). Use the
          same sign-in on this host as on Camera if your team enabled shared session cookies for
          <code className="mx-1 rounded bg-slate-800 px-1">*.messmass.com</code>.
        </p>
      </div>
    </div>
  );
}
