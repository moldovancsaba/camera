/**
 * FFF-branded sign-in: same OAuth flow as Camera, presented under FunFitFan / FFF identity.
 */

import Link from 'next/link';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';

export const dynamic = 'force-dynamic';

export default async function FffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from_logout?: string }>;
}) {
  const params = await searchParams;
  const fromLogout = params.from_logout === 'true';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-emerald-950 via-slate-900 to-slate-950 px-6 py-16 text-white">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-emerald-400">FFF</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Sign in to FunFitFan</h1>
        <p className="mt-3 text-slate-400">
          Continue with Google or Facebook. You will use the same account as on our other apps when your
          organization allows it.
        </p>

        <div className="mt-10 flex justify-center">
          <SocialLoginButtons fromLogout={fromLogout} variant="home" />
        </div>

        <Link
          href="/"
          className="mt-10 inline-block text-sm text-slate-500 transition hover:text-emerald-300"
        >
          ← Back to FunFitFan home
        </Link>
      </div>
    </div>
  );
}
