import Link from 'next/link';
import { translate } from '@/lib/i18n';

// The page of a share link that is not found does not know the event, so it says it in both languages (issue 352).
export default function ShareNotFound() {
  return (
    <main style={{ display: 'grid', gap: '0.75rem', justifyItems: 'center', minHeight: '100dvh', padding: '2rem 1rem', placeContent: 'center', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{translate('en', 'sharePage.meta.notFound')}</h1>
      <p style={{ margin: 0 }}>{translate('hu', 'sharePage.meta.notFound')}</p>
      <Link href="/">{translate('en', 'errorPage.goHome')} / {translate('hu', 'errorPage.goHome')}</Link>
    </main>
  );
}
