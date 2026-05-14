import { connectToDatabase } from '@/lib/db/mongodb';
import { COLLECTIONS } from '@/lib/db/schemas';

export function normalizeLandingPageSlugInput(input: unknown):
  | { ok: true; slug: string }
  | { ok: false; error: string } {
  const value = String(input ?? '').trim().toLowerCase();

  if (!value) {
    return { ok: false, error: 'Landing page slug is required.' };
  }
  if (value.length < 2 || value.length > 80) {
    return { ok: false, error: 'Landing page slug must be 2 to 80 characters.' };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    return {
      ok: false,
      error: 'Landing page slug may contain lowercase letters, numbers, and hyphens only.',
    };
  }

  return { ok: true, slug: value };
}

export async function getActiveLandingPageBySlug(slug: string) {
  const db = await connectToDatabase();
  return db.collection(COLLECTIONS.LANDING_PAGES).findOne({
    slug,
    isActive: { $ne: false },
  });
}
