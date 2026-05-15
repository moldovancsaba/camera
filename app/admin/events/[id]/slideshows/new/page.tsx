import { notFound } from 'next/navigation';
import SlideshowEditor from '@/components/admin/SlideshowEditor';
import { buildSlideshowEditorProps } from '@/lib/admin/build-slideshow-editor-props';

export default async function NewSlideshowForEvent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const props = await buildSlideshowEditorProps(id);
  if (!props) {
    notFound();
  }

  return (
    <SlideshowEditor
      mode="create"
      eventMongoId={props.eventMongoId}
      eventName={props.eventName}
      initialSlideshow={null}
    />
  );
}
