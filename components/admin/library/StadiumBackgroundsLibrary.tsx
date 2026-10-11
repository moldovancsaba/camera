'use client';

/**
 * The global stadium backgrounds (issue 326, docs/SCREEN_DESIGN.md): the general pictures the stage of an event's default slideshow is drawn on, with the event's colours over them. The generic
 * page of a tagged library picture (`TaggedImagesLibrary`) for the stadium background.
 */

import TaggedImagesLibrary from '@/components/admin/library/TaggedImagesLibrary';

export default function StadiumBackgroundsLibrary() {
  return <TaggedImagesLibrary kind="stadium" />;
}
