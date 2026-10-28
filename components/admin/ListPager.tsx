'use client';

import Link from 'next/link';
import { useUiLanguage } from '@/components/i18n/UiLanguageProvider';
import { adminOperationText } from '@/lib/i18n/admin-operations';
import { uiLanguageDirection } from '@/lib/i18n/locale-negotiation';

export interface ListPagerProps {
  /** The list's own path, e.g. `/admin/partners`. */
  basePath: string;
  /** Other query values to keep on every link (the search). */
  query?: Record<string, string>;
  page: number;
  pages: number;
  total: number;
  pageSize: number;
}

const pill = { border: '1px solid var(--mantine-color-default-border)', borderRadius: '0.625rem', minHeight: 44, minWidth: 44, padding: '0.5rem 0.875rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' } as const;

/** "Previous / 51–100 of 258 / Next" for a list that is read a page at a time (camera#375). Plain links: the page is part of the address, so a page can be shared and the back button works. */
export default function ListPager({ basePath, query = {}, page, pages, total, pageSize }: ListPagerProps) {
  const language = useUiLanguage();
  const t = (source: string) => adminOperationText(source, language);
  if (pages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams(query);
    if (target > 1) params.set('page', String(target));
    const text = params.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const number = new Intl.NumberFormat(language);
  return (
    <nav lang={language} dir={uiLanguageDirection(language)} aria-label={t('Pages')} style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', marginTop: '1rem' }}>
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" style={pill}>
          ← {t('Previous page')}
        </Link>
      ) : (
        <span aria-disabled="true" style={{ ...pill, color: 'var(--mantine-color-dimmed)' }}>
          ← {t('Previous page')}
        </span>
      )}
      <span aria-current="page" style={{ color: 'var(--mantine-color-dimmed)' }}>
        {number.format(from)}–{number.format(to)} {t('of')} {number.format(total)} · {t('Page')} {number.format(page)} {t('of')} {number.format(pages)}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" style={pill}>
          {t('Next page')} →
        </Link>
      ) : (
        <span aria-disabled="true" style={{ ...pill, color: 'var(--mantine-color-dimmed)' }}>
          {t('Next page')} →
        </span>
      )}
    </nav>
  );
}
