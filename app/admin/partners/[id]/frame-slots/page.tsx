import ScopedFrameSlotsPage from '@/components/admin/ScopedFrameSlotsPage';

export default function PartnerFrameSlotsPage({ params }: { params: Promise<{ id: string }> }) {
  return <ScopedFrameSlotsPage params={params} scope="partner" />;
}
