/**
 * FFF-branded sign-in: same OAuth flow as Camera, presented under FunFitFan / FFF identity.
 */

import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import FffLoginBackButton from '@/components/funfitfan/FffLoginBackButton';

export const dynamic = 'force-dynamic';

export default async function FffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from_logout?: string }>;
}) {
  const params = await searchParams;
  const fromLogout = params.from_logout === 'true';

  return (
    <div className="fff-app-inner fff-app-inner--centered">
      <p className="fff-login-kicker">FFF</p>
      <h1 className="fff-login-title">Sign in to FunFitFan</h1>
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
