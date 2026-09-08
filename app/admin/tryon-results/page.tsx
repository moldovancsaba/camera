import { redirect } from 'next/navigation';

// WHAT: Legacy URL kept as a redirect so old bookmarks and links still land on
// the moderation page, which lives at /admin/tryon/vetting (camera#125). The
// query string is forwarded so bucket links like ?archive=greatest or
// ?failed=1 keep working.
export default async function LegacyTryOnResultsRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && value) qs.set(key, value);
  }
  const suffix = qs.toString();
  redirect(suffix ? `/admin/tryon/vetting?${suffix}` : '/admin/tryon/vetting');
}
