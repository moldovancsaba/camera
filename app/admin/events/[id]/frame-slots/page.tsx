import { redirect } from 'next/navigation';

export default async function EventFrameSlotsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/events/${id}/frames#generated-frame-layout`);
}
