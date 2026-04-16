/**
 * FunFitFan landing (PWA install uses manifest under /fff on this origin).
 */

import { DynaPuff } from 'next/font/google';
import { getSession } from '@/lib/auth/session';
import FunFitFanLandingActions from '@/components/funfitfan/FunFitFanLandingActions';

export const dynamic = 'force-dynamic';

const fffTitleFont = DynaPuff({
  subsets: ['latin'],
  weight: ['700'],
  display: 'swap',
});

export default async function FunFitFanLandingPage() {
  const session = await getSession();

  return (
    <div className="fff-app-inner">
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

      <FunFitFanLandingActions signedIn={Boolean(session)} />

      <p className="fff-landing-footnote">
        Add to Home Screen: use your browser menu on mobile to install FFF as an app (PWA). Shared cookies for{' '}
        <code className="fff-landing-code">*.messmass.com</code> keep you signed in across subdomains when your team
        enables that.
      </p>
    </div>
  );
}
