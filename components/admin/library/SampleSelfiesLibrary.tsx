'use client';

/**
 * The global sample selfies (issue 540, docs/WELCOME_SCREEN_PHOTO_PLAN.md): the general selfies that fill the photo window of the welcome page screen for every event that has nothing of its own.
 * It is the generic page of a tagged library picture (`TaggedImagesLibrary`) for the sample selfie; the name is the one the page always imported.
 */

import TaggedImagesLibrary from '@/components/admin/library/TaggedImagesLibrary';

export default function SampleSelfiesLibrary() {
  return <TaggedImagesLibrary kind="selfie" />;
}
