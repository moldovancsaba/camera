import { notFound } from 'next/navigation';
import LandingPageEditor from '@/components/admin/LandingPageEditor';
import { buildLandingPageEditorProps } from '@/lib/admin/build-landing-page-editor-props';

export default async function EditLandingPageForEvent({
  params,
}: {
  params: Promise<{ id: string; landingPageId: string }>;
}) {
  const { id, landingPageId } = await params;
  const props = await buildLandingPageEditorProps(id, landingPageId);
  if (!props || !props.landingPage) {
    notFound();
  }

  return (
    <LandingPageEditor
      mode="edit"
      eventMongoId={props.eventMongoId}
      eventName={props.eventName}
      slideshows={props.slideshows}
      layouts={props.layouts}
      logos={props.logos}
      cssPresets={props.cssPresets}
      actionPresets={props.actionPresets}
      initialLandingPage={props.landingPage}
    />
  );
}
