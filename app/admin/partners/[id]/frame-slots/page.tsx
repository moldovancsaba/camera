import { redirect } from 'next/navigation';

export default async function PartnerFrameSlotsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/partners/${id}/frames#generated-frame-layout`);
}
