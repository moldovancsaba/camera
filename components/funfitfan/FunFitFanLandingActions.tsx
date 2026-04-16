'use client';

import { fffBrowser } from '@/lib/funfitfan/fff-browser-urls';

export default function FunFitFanLandingActions({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="app-btn-stack app-btn-stack--fff-landing">
      {!signedIn ? (
        <a href={fffBrowser.login} className="app-btn app-btn--secondary">
          Sign in/sign up
        </a>
      ) : null}
      {signedIn ? (
        <>
          <a href={fffBrowser.log} className="app-btn app-btn--primary">
            I DO IT
          </a>
          <a href={fffBrowser.history} className="app-btn app-btn--secondary">
            HISTORY
          </a>
          <a href="/api/auth/logout" className="app-btn app-btn--neutral">
            Log out
          </a>
        </>
      ) : null}
    </div>
  );
}
