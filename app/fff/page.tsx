/**
 * FunFitFan landing (PWA install uses manifest under /fff on this origin).
 */

import { getSession } from '@/lib/auth/session';
import FunFitFanLandingActions from '@/components/funfitfan/FunFitFanLandingActions';

export const dynamic = 'force-dynamic';

export default async function FunFitFanLandingPage() {
  const session = await getSession();

  return (
    <div className="fff-app-inner">
      <h1 className="fff-landing-title">FFF</h1>
      <p className="fff-landing-subtitle">FunFitFan</p>
      <p className="fff-landing-lede">
        Your fitness home: log a framed activity card (your team&apos;s frame), browse your reel, and open gym
        lessons — all under FFF.
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
