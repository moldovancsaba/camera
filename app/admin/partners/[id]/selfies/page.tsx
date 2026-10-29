import ScopedPictureSlotPage from '@/components/admin/ScopedPictureSlotPage';

export default function PartnerSelfiesPage({ params }: { params: Promise<{ id: string }> }) {
  return <ScopedPictureSlotPage params={params} scope="partner" kind="selfie" />;
}
