import { redirect } from 'next/navigation';

// WHAT: Legacy URL kept as a redirect so old bookmarks and links still land on
// the garment catalog, which lives at /admin/tryon/suits (camera#125).
export default async function LegacyTryOnSuitsRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const search = typeof resolved.search === 'string' ? resolved.search.trim() : '';
  redirect(search ? `/admin/tryon/suits?search=${encodeURIComponent(search)}` : '/admin/tryon/suits');
}
