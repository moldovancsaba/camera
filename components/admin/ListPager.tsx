import Link from 'next/link';

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
  if (pages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams(query);
    if (target > 1) params.set('page', String(target));
    const text = params.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pages" style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', marginTop: '1rem' }}>
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" style={pill}>
          ← Previous
        </Link>
      ) : (
        <span aria-disabled="true" style={{ ...pill, color: 'var(--mantine-color-dimmed)' }}>
          ← Previous
        </span>
      )}
      <span aria-current="page" style={{ color: 'var(--mantine-color-dimmed)' }}>
        {from}–{to} of {total} · page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" style={pill}>
          Next →
        </Link>
      ) : (
        <span aria-disabled="true" style={{ ...pill, color: 'var(--mantine-color-dimmed)' }}>
          Next →
        </span>
      )}
    </nav>
  );
}
