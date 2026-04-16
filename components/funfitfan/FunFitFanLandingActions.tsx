'use client';

export default function FunFitFanLandingActions({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="app-btn-stack app-btn-stack--fff-landing">
      {!signedIn ? (
        <a href="/fff/login" className="app-btn app-btn--secondary">
          Sign in/sign up
        </a>
      ) : null}
      {signedIn ? (
        <>
          <a href="/fff/log" className="app-btn app-btn--primary">
            I DO IT
          </a>
          <a href="/fff/history" className="app-btn app-btn--secondary">
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
