import { notFound } from 'next/navigation';
import SlideshowEditor from '@/components/admin/SlideshowEditor';
import { buildSlideshowEditorProps } from '@/lib/admin/build-slideshow-editor-props';

export default async function EditSlideshowForEvent({
  params,
}: {
  params: Promise<{ id: string; slideshowId: string }>;
}) {
  const { id, slideshowId } = await params;
  const props = await buildSlideshowEditorProps(id, slideshowId);
  if (!props || !props.slideshow) {
    notFound();
  }

  return (
    <SlideshowEditor
      mode="edit"
      eventMongoId={props.eventMongoId}
      eventName={props.eventName}
      initialSlideshow={props.slideshow}
    />
  );
}
