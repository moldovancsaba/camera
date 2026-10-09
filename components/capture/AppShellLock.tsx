'use client';

import { useEffect } from 'react';

const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'];

/**
 * Makes the camera steps behave like an app (camera#222): the page cannot scroll, bounce or
 * pull-to-refresh (CSS keyed on `html[data-app-lock]` in app/globals.css) and the browser cannot
 * zoom it. iOS Safari ignores `user-scalable=no` for the page and fires non-standard gesture
 * events instead, which honour preventDefault, so those are cancelled here. Mount it only while a
 * camera step or a journey page is on screen: the consent page stays zoomable on purpose (reading
 * content, see docs/GDS_CAMERA_ADOPTION.md and lib/capture/page-lock.ts).
 *
 * With `zoomOnly` only the zoom is cancelled (`html[data-app-zoom-lock]`) and the page still scrolls:
 * for the journey pages around the camera steps (welcome, who are you, CTA, restart), which can be
 * taller than a small phone (camera#490).
 */
export default function AppShellLock({ zoomOnly = false }: { zoomOnly?: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    const attribute = zoomOnly ? 'appZoomLock' : 'appLock';
    root.dataset[attribute] = '';
    const cancel = (event: Event) => event.preventDefault();
    for (const type of GESTURE_EVENTS) document.addEventListener(type, cancel, { passive: false });
    return () => {
      delete root.dataset[attribute];
      for (const type of GESTURE_EVENTS) document.removeEventListener(type, cancel);
    };
  }, [zoomOnly]);
  return null;
}
