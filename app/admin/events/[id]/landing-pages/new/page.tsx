import { notFound } from 'next/navigation';
import LandingPageEditor from '@/components/admin/LandingPageEditor';
import { buildLandingPageEditorProps } from '@/lib/admin/build-landing-page-editor-props';

export default async function NewLandingPageForEvent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const props = await buildLandingPageEditorProps(id);
  if (!props) {
    notFound();
  }

  return (
    <LandingPageEditor
      mode="create"
      eventMongoId={props.eventMongoId}
      eventName={props.eventName}
      slideshows={props.slideshows}
      layouts={props.layouts}
      logos={props.logos}
      cssPresets={props.cssPresets}
      actionPresets={props.actionPresets}
      initialLandingPage={null}
    />
  );
}
