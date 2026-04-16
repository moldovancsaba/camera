/**
 * FunFitFan landing (PWA install uses manifest under /fff on this origin).
 */

import Link from 'next/link';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function FunFitFanLandingPage() {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex max-w-lg flex-col px-6 py-16">
        <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-sm">FFF</h1>
        <p className="mt-2 text-xl font-semibold text-emerald-400">FunFitFan</p>
        <p className="mt-6 text-lg leading-relaxed text-slate-300">
          Your fitness home: log a framed activity card (your team&apos;s frame), browse your reel, and open
          gym lessons — all under FFF.
        </p>

        {!session ? (
          <p className="mt-6">
            <Link
              href="/fff/login"
              className="font-semibold text-emerald-400 underline decoration-emerald-600/50 underline-offset-4 hover:text-emerald-300"
            >
              Sign in to FunFitFan
            </Link>
          </p>
        ) : null}

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
        </div>

        <p className="mt-12 text-sm text-slate-500">
          Add to Home Screen: use your browser menu on mobile to install FFF as an app (PWA). Shared cookies
          for <code className="mx-1 rounded bg-slate-800 px-1">*.messmass.com</code> keep you signed in across
          subdomains when your team enables that.
        </p>
      </div>
    </div>
  );
}
