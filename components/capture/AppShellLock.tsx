'use client';

import { useEffect } from 'react';

/**
 * Makes the camera steps behave like an app (camera#222): the page cannot scroll, bounce or
 * pull-to-refresh (CSS keyed on `html[data-app-lock]` in app/globals.css) and the browser cannot
 * zoom it. iOS Safari ignores `user-scalable=no` for the page and fires non-standard gesture
 * events instead, which honour preventDefault, so those are cancelled here. Mount it only while a
 * camera step is on screen: the consent, terms and form pages stay zoomable on purpose (reading
 * content, see docs/GDS_CAMERA_ADOPTION.md).
 */
const GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'];

export default function AppShellLock() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.appLock = '';
    const cancel = (event: Event) => event.preventDefault();
    for (const type of GESTURE_EVENTS) document.addEventListener(type, cancel, { passive: false });
    return () => {
      delete root.dataset.appLock;
      for (const type of GESTURE_EVENTS) document.removeEventListener(type, cancel);
    };
  }, []);
  return null;
}
