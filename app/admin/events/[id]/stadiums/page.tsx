import ScopedPictureSlotPage from '@/components/admin/ScopedPictureSlotPage';

export default function EventStadiumsPage({ params }: { params: Promise<{ id: string }> }) {
  return <ScopedPictureSlotPage params={params} scope="event" kind="stadium" />;
}
