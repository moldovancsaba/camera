import Link from 'next/link';
import { headers } from 'next/headers';
import { translate } from '@/lib/i18n';
import { deviceUiLanguage, parseAcceptLanguage } from '@/lib/i18n/locale-negotiation';

// An unknown share id has no event to supply a partner fallback, so use the
// visitor's supported device language and the app-level English fallback.
export default async function ShareNotFound() {
  const language = deviceUiLanguage(parseAcceptLanguage((await headers()).get('accept-language'))) ?? 'en';
  return (
    <main style={{ display: 'grid', gap: '0.75rem', justifyItems: 'center', minHeight: '100dvh', padding: '2rem 1rem', placeContent: 'center', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{translate(language, 'sharePage.meta.notFound')}</h1>
      <Link href="/">{translate(language, 'errorPage.goHome')}</Link>
    </main>
  );
}
