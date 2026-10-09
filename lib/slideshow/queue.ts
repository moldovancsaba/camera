/**
 * The queue rules of the slideshow player (camera#476), kept out of the component so they can be tested without a browser.
 *
 * The queue is `[current, ...upcoming]`. The server answers "the least played photos, oldest first" and counts a play only when a slide
 * becomes the current one, so a photo that waits in the queue still looks unplayed to the server. The player therefore has to tell the
 * server what it already holds (`excludeIds`) and must never append a photo it already holds (`appendFresh`). Without that, a refill
 * in fixed order appends the same next photo again and again and the screen shows one picture for `bufferSize + 1` slides.
 */

export interface QueueSlide {
  submissions: Array<{ _id: string }>;
}

/** The server accepts at most this many ids in `exclude` (the longest queue is 51 slides). */
export const EXCLUDE_CAP = 100;

export function slideKey(slide: QueueSlide): string {
  return slide.submissions.map((s) => s._id).join('-');
}

export function cloneSlide<S extends QueueSlide>(slide: S): S {
  return { ...slide, submissions: slide.submissions.map((s) => ({ ...s })) };
}

/** Every slide ever received, once, in the order it arrived: the loop the player falls back on when the server has nothing new. */
export function mergeSeed<S extends QueueSlide>(existing: S[] | null, chunk: S[]): S[] {
  const base = existing?.length ? [...existing] : [];
  const keys = new Set(base.map(slideKey));
  for (const slide of chunk) {
    if (!keys.has(slideKey(slide))) {
      keys.add(slideKey(slide));
      base.push(cloneSlide(slide));
    }
  }
  return base;
}

/** The submission ids the queue holds, for the `exclude` parameter of the playlist call. */
export function excludeIds(queue: QueueSlide[], cap: number = EXCLUDE_CAP): string[] {
  const ids = new Set<string>();
  for (const slide of queue) for (const sub of slide.submissions) ids.add(sub._id);
  return [...ids].slice(0, cap);
}

/** The slides of an answer that the queue does not hold yet (and that appear once in the answer). */
export function freshSlides<S extends QueueSlide>(queue: S[], answer: S[]): S[] {
  const keys = new Set(queue.map(slideKey));
  return answer.filter((slide) => {
    const key = slideKey(slide);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

/** Append the fresh slides of an answer up to `target` slides. The same array comes back when nothing is added. */
export function appendFresh<S extends QueueSlide>(queue: S[], answer: S[], target: number): S[] {
  if (queue.length >= target) return queue;
  const fresh = freshSlides(queue, answer).slice(0, target - queue.length);
  return fresh.length === 0 ? queue : [...queue, ...fresh];
}

/**
 * Fill the queue up to `target` from the seed, continuing the loop after the slide the queue ends with. Slides the queue does not hold
 * come first; only when the whole seed is smaller than the queue do slides repeat (a pool smaller than the queue repeats by nature).
 */
export function appendFromSeed<S extends QueueSlide>(queue: S[], seed: S[] | null, target: number): S[] {
  if (queue.length >= target || !seed?.length) return queue;
  const tailKey = queue.length > 0 ? slideKey(queue[queue.length - 1]) : null;
  const tail = tailKey === null ? -1 : seed.findIndex((s) => slideKey(s) === tailKey);
  const ordered = seed.map((_, i) => seed[(tail + 1 + i) % seed.length]);
  const held = new Set(queue.map(slideKey));
  const unseen = ordered.filter((s) => !held.has(slideKey(s)));
  // Repeats go on round the loop from the slide after the last one taken.
  const resume = unseen.length > 0 ? ordered.findIndex((s) => slideKey(s) === slideKey(unseen[unseen.length - 1])) + 1 : 0;
  const out = [...queue];
  for (let i = 0; out.length < target; i++) {
    out.push(cloneSlide(i < unseen.length ? unseen[i] : ordered[(resume + i - unseen.length) % ordered.length]));
  }
  return out;
}

/** What the server's answer does to the queue: its fresh slides, or - when it has nothing new for us - the loop continued from the seed. */
export function mergeAnswer<S extends QueueSlide>(queue: S[], answer: S[], seed: S[] | null, target: number): S[] {
  const next = appendFresh(queue, answer, target);
  return next === queue ? appendFromSeed(queue, seed, target) : next;
}

/**
 * The queue after the current slide has been shown (loop mode). With one slide left the loop goes on with the next slide of the seed, so a
 * refill that is stuck shows other pictures, not the same one again. Nothing to show and nothing to fall back on: the same array.
 */
export function advanceLoop<S extends QueueSlide>(queue: S[], seed: S[] | null, target: number): S[] {
  if (queue.length > 1) return queue.slice(1);
  if (queue.length === 0) return seed?.length ? appendFromSeed([], seed, Math.max(target, seed.length)) : queue;
  const next = appendFromSeed(queue, seed, 2);
  return next.length > 1 ? next.slice(1) : [cloneSlide(queue[0])];
}
