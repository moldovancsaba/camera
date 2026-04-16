/**
 * FunFitFan landing (PWA manifest URL still under `/fff/manifest.webmanifest`; browser paths omit `/fff`).
 */

import { DynaPuff } from 'next/font/google';
import { getSession } from '@/lib/auth/session';
import { oauthReturnBannerMessage } from '@/lib/auth/oauth-return-message';
import FunFitFanLandingActions from '@/components/funfitfan/FunFitFanLandingActions';

export const dynamic = 'force-dynamic';

const fffTitleFont = DynaPuff({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
});

export default async function FunFitFanLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const session = await getSession();
  const signedIn = session != null && session.appAccess !== false;
  const sp = await searchParams;
  const oauthMsg = oauthReturnBannerMessage(sp.error, sp.message);

  return (
    <div className="fff-app-inner">
      {oauthMsg ? (
        <p className="mb-6 rounded-lg border border-red-800/40 bg-red-950/40 px-4 py-3 text-sm text-red-100" role="alert">
          {oauthMsg}
        </p>
      ) : null}
      <h1 className={`fff-landing-brand-line ${fffTitleFont.className}`}>
        <span className="fff-landing-brand-fff">FFF</span>
        <span className="fff-landing-brand-sep" aria-hidden="true">
          {' '}
          |{' '}
        </span>
        <span className="fff-landing-brand-name">FunFitFan</span>
      </h1>
      <p className="fff-landing-lede">
        we help you to workout better, in the GYM, on the run, under the water, over the top. capture the moments and
        share the memories.
      </p>

      <FunFitFanLandingActions signedIn={signedIn} />

      <p className="fff-landing-footnote">
        Add to Home Screen: use your browser menu on mobile to install FFF as an app (PWA). Shared cookies for{' '}
        <code className="fff-landing-code">*.messmass.com</code> keep you signed in across subdomains when your team
        enables that.
      </p>
    </div>
  );
}
