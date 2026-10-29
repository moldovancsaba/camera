import ScopedFrameSlotsPage from '@/components/admin/ScopedFrameSlotsPage';

export default function EventFrameSlotsPage({ params }: { params: Promise<{ id: string }> }) {
  return <ScopedFrameSlotsPage params={params} scope="event" />;
}
