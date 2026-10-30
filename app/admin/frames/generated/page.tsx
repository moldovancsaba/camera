import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Keep old bookmarks working while the maintenance console lives in Settings → Service.
export default async function GeneratedFramesRolloutPage() {
  redirect('/admin/settings/service#generated-frame-rollout');
}
