/**
 * Which pages come before the photo is saved (issue 535). By default that is everything before the take-photo page: saving is part of that page. When an event unticked "Submit is part of
 * this page" it has an active `submit` page after the take-photo page, and a consent or login page between the two still counts as before the save (the photo is saved after it), so the
 * defaults are not added a second time and the acceptance can still sit on the login page. Pure.
 */

interface PageLike {
  pageType: string;
  isActive: boolean;
  order: number;
}

/** The active pages in order, cut where the photo is saved: before the active submit page after the take-photo page, else before the take-photo page, else all of them. */
export function pagesBeforeSave<T extends PageLike>(pages: readonly T[]): T[] {
  const active = [...pages].filter((page) => page.isActive).sort((a, b) => a.order - b.order);
  const photoAt = active.findIndex((page) => page.pageType === 'take-photo');
  if (photoAt === -1) return active;
  const submitAt = active.findIndex((page, index) => index > photoAt && page.pageType === 'submit');
  return active.slice(0, submitAt === -1 ? photoAt : submitAt);
}
