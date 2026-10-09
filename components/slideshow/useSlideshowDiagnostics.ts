'use client';

/**
 * Slideshow diagnostics (camera#476, step S1): the player records small events here, and this hook keeps a ring of the last 300 in memory,
 * sends the new ones to the server every minute (and at once on a stall), and adds a heartbeat every 10 s with what the page itself
 * sees (does it still paint, long tasks, memory, network class). Best effort and silent: it never throws, never blocks the player, and
 * sends no picture, name or address (lib/slideshow/diagnostics.ts). `?debug=1` also exposes the ring as `window.__slideshowLog`
 * and shows SlideshowDebugPanel.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  SLIDESHOW_DIAGNOSTIC_ENDPOINT,
  SLIDESHOW_DIAGNOSTIC_MAX_EVENTS,
  SLIDESHOW_DIAGNOSTIC_VERSION,
  type SlideshowEvent,
  type SlideshowEventType,
  type SlideshowEventValue,
} from '@/lib/slideshow/diagnostics';

const RING_SIZE = 300;
const FLUSH_MS = 60_000;
const HEARTBEAT_MS = 10_000;
/** After a stall is reported, the next is reported no sooner than this. */
const STALL_REPEAT_MS = 30_000;

/** What the player tells the hook about itself, read only when the hook needs it. */
export interface SlideshowDiagnosticState {
  /** The show should be moving: loaded, playing, a slide on screen. */
  active: boolean;
  /** How long one slide is held. */
  holdMs: number;
  queueLen: number;
  preloaded: number;
  /** The refill is in flight. */
  busy: boolean;
}

export type RecordDiagnostic = (type: SlideshowEventType, fields?: Record<string, SlideshowEventValue | undefined>) => void;

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

function newSession(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10).padEnd(8, '0')).join('').slice(0, 32);
  }
}

export function useSlideshowDiagnostics(opts: {
  slideshowId: string;
  variant: 'fullscreen' | 'embedded';
  getState: () => SlideshowDiagnosticState;
}): { record: RecordDiagnostic } {
  const { slideshowId, variant } = opts;
  const getStateRef = useRef(opts.getState);
  const ring = useRef<SlideshowEvent[]>([]);
  const unsent = useRef<SlideshowEvent[]>([]);
  const sinks = useRef<{ record: RecordDiagnostic; flush: () => void; lastShownAt: number }>({ record: () => undefined, flush: () => undefined, lastShownAt: 0 });

  useEffect(() => {
    getStateRef.current = opts.getState;
  });

  const record = useCallback<RecordDiagnostic>((type, fields) => {
    sinks.current.record(type, fields);
  }, []);

  useEffect(() => {
    const started = performance.now();
    const session = newSession();
    const debug = new URLSearchParams(window.location.search).get('debug') === '1';
    const sink = sinks.current;
    sink.lastShownAt = started;
    if (debug) (window as unknown as { __slideshowLog?: SlideshowEvent[] }).__slideshowLog = ring.current;

    sink.record = (type, fields) => {
      try {
        const event: SlideshowEvent = { t: Math.round(performance.now() - started), type };
        for (const [name, value] of Object.entries(fields ?? {})) if (value !== undefined) event[name] = typeof value === 'number' ? Math.round(value * 10) / 10 : value;
        if (type === 'slide_shown') sink.lastShownAt = performance.now();
        ring.current.push(event);
        if (ring.current.length > RING_SIZE) ring.current.splice(0, ring.current.length - RING_SIZE);
        unsent.current.push(event);
        if (unsent.current.length > SLIDESHOW_DIAGNOSTIC_MAX_EVENTS * 2) unsent.current.splice(0, unsent.current.length - SLIDESHOW_DIAGNOSTIC_MAX_EVENTS * 2);
        if (unsent.current.length >= SLIDESHOW_DIAGNOSTIC_MAX_EVENTS - 10) sink.flush();
      } catch {
        /* diagnostics never get in the way of the show */
      }
    };

    sink.flush = () => {
      try {
        if (unsent.current.length === 0) return;
        const events = unsent.current.splice(0, SLIDESHOW_DIAGNOSTIC_MAX_EVENTS);
        const body = JSON.stringify({ v: SLIDESHOW_DIAGNOSTIC_VERSION, slideshowId, variant, session, uptimeS: Math.round((performance.now() - started) / 1000), events });
        if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(SLIDESHOW_DIAGNOSTIC_ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
        void fetch(SLIDESHOW_DIAGNOSTIC_ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined);
      } catch {
        /* best effort */
      }
    };

    // Does the page still paint? The longest gap between two animation frames since the last heartbeat, and the long tasks.
    let maxGap = 0;
    let lastFrame = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (document.visibilityState === 'visible') maxGap = Math.max(maxGap, now - lastFrame);
      lastFrame = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVisibility = () => {
      lastFrame = performance.now();
      if (document.visibilityState === 'hidden') sink.flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', sink.flush);

    let longTasks = 0;
    let longMax = 0;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks += 1;
          longMax = Math.max(longMax, entry.duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      observer = null;
    }

    // The browser keeps only 250 resource timings by default; the player reads them to see how often a picture was fetched.
    try {
      performance.setResourceTimingBufferSize(600);
      performance.addEventListener('resourcetimingbufferfull', () => performance.clearResourceTimings());
    } catch {
      /* not supported */
    }

    const onError = (e: ErrorEvent) => sink.record('error', { msg: String(e.message || 'error').slice(0, 80) });
    const onRejection = (e: PromiseRejectionEvent) => sink.record('error', { msg: String((e.reason as Error | undefined)?.message ?? e.reason ?? 'rejection').slice(0, 80) });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    const heartbeat = window.setInterval(() => {
      const state = getStateRef.current();
      const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      sink.record('heartbeat', {
        vis: document.visibilityState,
        rafGapMs: maxGap,
        longTasks,
        longMaxMs: longMax,
        heapMb: heap === undefined ? undefined : heap / 1048576,
        preloaded: state.preloaded,
        q: state.queueLen,
        online: navigator.onLine,
        net: conn?.effectiveType,
        downlink: conn?.downlink,
        rtt: conn?.rtt,
      });
      maxGap = 0;
      longTasks = 0;
      longMax = 0;
    }, HEARTBEAT_MS);

    // A stall: the show should be moving and no slide has become current for two holds and five seconds.
    let lastStall = 0;
    const watch = window.setInterval(() => {
      const state = getStateRef.current();
      const now = performance.now();
      if (!state.active || document.visibilityState !== 'visible') return;
      const since = now - sink.lastShownAt;
      if (since > state.holdMs * 2 + 5000 && now - lastStall > STALL_REPEAT_MS) {
        lastStall = now;
        sink.record('stall', { sinceMs: since, q: state.queueLen, busy: state.busy, vis: document.visibilityState });
        sink.flush();
      }
    }, 1000);

    const flushTimer = window.setInterval(sink.flush, FLUSH_MS);

    return () => {
      sink.flush();
      cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', sink.flush);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.clearInterval(heartbeat);
      window.clearInterval(watch);
      window.clearInterval(flushTimer);
      sink.record = () => undefined;
      sink.flush = () => undefined;
    };
  }, [slideshowId, variant]);

  return { record };
}
