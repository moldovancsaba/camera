/**
 * FFF-branded sign-in: same OAuth flow as Camera, presented under FunFitFan / FFF identity.
 */

import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import FffLoginBackButton from '@/components/funfitfan/FffLoginBackButton';
import { oauthReturnBannerMessage } from '@/lib/auth/oauth-return-message';

export const dynamic = 'force-dynamic';

export default async function FffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from_logout?: string; error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const fromLogout = params.from_logout === 'true';
  const oauthMsg = oauthReturnBannerMessage(params.error, params.message);

  return (
    <div className="fff-app-inner fff-app-inner--centered">
      {oauthMsg ? (
        <p
          className="mb-6 max-w-md rounded-lg border border-red-800/40 bg-red-950/40 px-4 py-3 text-center text-sm text-red-100"
          role="alert"
        >
          {oauthMsg}
        </p>
      ) : null}
      <p className="fff-login-kicker">FFF</p>
      <h1 className="fff-login-title">Sign in/sign up</h1>
      <p className="fff-login-lede">
        Continue with Google or Facebook. You will use the same account as on our other apps when your organization
        allows it.
      </p>

      <div className="fff-login-oauth">
        <SocialLoginButtons fromLogout={fromLogout} variant="home" />
      </div>

      <FffLoginBackButton />
    </div>
  );
}
