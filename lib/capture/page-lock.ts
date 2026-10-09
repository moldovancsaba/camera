/**
 * Which pages of the capture journey the browser may not zoom (camera#224, camera#490). The camera steps are locked in full by AppShellLock (no scroll, no
 * zoom). The journey pages before and after them (welcome, who are you, CTA, restart) are picture or form screens that must still scroll when they are taller
 * than a small phone, so they are locked against zoom only. The consent page is for reading, so it stays zoomable on purpose: the owner decided that
 * with #224, and being able to enlarge a text is a legibility need.
 */

export type PhasePageLock = 'zoom' | 'none';

export function phasePageLock(pageType: string): PhasePageLock {
  return pageType === 'accept' ? 'none' : 'zoom';
}
