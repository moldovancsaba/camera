import ScopedPictureSlotPage from '@/components/admin/ScopedPictureSlotPage';

export default function EventSelfiesPage({ params }: { params: Promise<{ id: string }> }) {
  return <ScopedPictureSlotPage params={params} scope="event" kind="selfie" />;
}
