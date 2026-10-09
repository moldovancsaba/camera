'use client';
/* eslint-disable @next/next/no-img-element */

/**
 * Slideshow playback: FIFO queue `[current, …upcoming]`.
 * `bufferSize` (settings) = how many slides to keep **behind** the one on screen → total slots = bufferSize + 1.
 * Loop mode tops up asynchronously after each advance. The queue rules (what to ask the server, what to append, what to do when the
 * server has nothing new) live in `lib/slideshow/queue.ts` and are tested there; a refill tells the server which photos the queue already
 * holds (`exclude`) and never appends one twice (camera#476).
 */

import { pickRandom } from '@/lib/slots/resolve';
import SlideshowDebugPanel from '@/components/slideshow/SlideshowDebugPanel';
import { useSlideshowDiagnostics } from '@/components/slideshow/useSlideshowDiagnostics';
import { hostOf, shortId } from '@/lib/slideshow/diagnostics';
import { PRELOAD_FAIL_TTL_MS, createPreloader } from '@/lib/slideshow/preload';
import { fetchWithTimeout, nextBackoffMs } from '@/lib/slideshow/resilience';
import { reloadReason } from '@/lib/slideshow/reload';
import { recentReloads, watchdogAction } from '@/lib/slideshow/watchdog';
import ScreenDesignLayers, { screenWindowStyle } from '@/components/slideshow/ScreenDesignLayers';
import type { ResolvedScreenDesign } from '@/lib/slideshow/screen-design';
import {
  useEffect,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  type CSSProperties,
} from 'react';
import { isMissingImagePlaceholder } from '@/lib/media/placeholder';
import {
  slideshowStageDimensions,
  type ViewportScaleMode,
} from '@/lib/slideshow/viewport-scale';
import {
  advanceLoop,
  appendFresh,
  appendFromSeed,
  excludeIds,
  freshSlides,
  mergeSeed,
  slideKey,
} from '@/lib/slideshow/queue';
import {
  CAMERA_STAGE_BLACK,
  CAMERA_STAGE_WHITE,
  SLIDESHOW_DEFAULT_BACKGROUND_ACCENT,
  SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY,
} from '@/lib/gds/tokens/colors';

const DEFAULT_BG_PRIMARY = SLIDESHOW_DEFAULT_BACKGROUND_PRIMARY;
const DEFAULT_BG_ACCENT = SLIDESHOW_DEFAULT_BACKGROUND_ACCENT;

interface Submission {
  _id: string;
  imageUrl: string;
  width: number;
  height: number;
}

interface Slide {
  type: 'single' | 'mosaic';
  aspectRatio: '16:9' | '1:1' | '9:16';
  submissions: Submission[];
}

interface SlideshowSettings {
  _id: string;
  name: string;
  eventName: string;
  /** Stage width ÷ height. Defaults to 16/9 when omitted. */
  stageAspect?: number;
  transitionDurationMs: number;
  fadeDurationMs: number;
  bufferSize: number;
  refreshStrategy: 'continuous' | 'batch';
  playMode?: 'once' | 'loop';
  orderMode?: 'fixed' | 'random';
  /** Two picture layers: the next picture fades in over the one before (camera#476, S4b). */
  crossfade?: boolean;
  backgroundPrimaryColor?: string;
  backgroundAccentColor?: string;
  backgroundImageUrl?: string | null;
  viewportScale?: ViewportScaleMode;
  /** A giant-screen design: picture over the stage, a window for the photos, a QR code and texts (camera#309). */
  screenDesign?: ResolvedScreenDesign | null;
}

export interface SlideshowPlayerCoreProps {
  slideshowId: string;
  /** When set (e.g. layout region id), random-order playlists shuffle independently per instance */
  instanceKey?: string;
  objectFit?: 'contain' | 'cover';
  /**
   * Layout / embedded: extra ms added to **every** auto-advance hold (`transitionDurationMs` + delay).
   * Fullscreen: optional extra ms on the **first** auto-advance only (replay resets). JSON may send string.
   */
  delayMs?: number | string;
  variant?: 'fullscreen' | 'embedded';
  className?: string;
}

/** Admin `bufferSize` = upcoming prefetches; cap matches PATCH API (1–50). */
function totalQueueSlotsFromBufferSize(bufferSize: unknown): number {
  const upcoming = Math.max(1, Math.min(50, Math.floor(Number(bufferSize) || 10)));
  return upcoming + 1;
}

function normalizeDelayMs(raw: number | string | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(600_000, Math.floor(raw)));
  }
  if (typeof raw === 'string') {
    const n = parseInt(raw.trim(), 10);
    if (Number.isFinite(n)) {
      return Math.max(0, Math.min(600_000, n));
    }
  }
  return 0;
}

function clampTimingMs(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

/**
 * Fullscreen: use slideshow.viewportScale (fit letterbox vs fill crop in browser).
 * Embedded (layout tile): use region Photo scaling — cover = 16:9 stage fills the cell (crop overflow),
 * contain = full stage visible in cell. Slideshow viewportScale is ignored in tiles so layout wins.
 */
function viewportModeForStage(
  variant: 'fullscreen' | 'embedded',
  objectFit: 'contain' | 'cover',
  slideshowViewportScale: ViewportScaleMode | undefined
): ViewportScaleMode {
  if (variant === 'embedded') {
    return objectFit === 'cover' ? 'fill' : 'fit';
  }
  return slideshowViewportScale === 'fill' ? 'fill' : 'fit';
}

/** A request to our own server gives up after this; the picture loads have their own, longer deadline (lib/slideshow/preload.ts). */
const API_TIMEOUT_MS = 8000;
/** The loading-screen logo is not worth holding the start for. */
const LOGO_TIMEOUT_MS = 5000;
/** One refill releases the single-flight lock after this, whatever is still in flight. */
const REFILL_LOCK_MAX_MS = 20_000;
/** The show starts when this many slides (and the screen design's picture) are ready; the rest of the first answer loads while it plays. */
const START_SLIDES = 2;
/** The screen design's picture is waited for this long at most: a start without it is better than no start. */
const OVERLAY_WAIT_MS = 4000;
/** How many slides at the head of the queue are kept loaded; deeper ones were loaded when they were appended. */
const PRELOAD_AHEAD = 4;
/** How many of them are also decoded, so the swap does not decode a multi-megapixel picture on the screen's device; more would pin memory. */
const DECODE_AHEAD = 3;

/**
 * One picture load. No `crossOrigin`: we never read the pixels, and the screen shows the picture with a plain `<img>`; a CORS-mode preload is a
 * different request from it, so the browser fetched every picture twice and the swap waited for the second (measured on Chrome 152: a CORS preload
 * followed by a plain `<img>` gives 2 resource entries, a plain preload gives 1; camera#476). Background loads are low priority so the picture on
 * screen and our own calls are not held up by them.
 */
function loadImage(url: string, { urgent }: { urgent: boolean }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.fetchPriority = urgent ? 'high' : 'low';
    // A host's "image not found" stand-in loads like a photo (a browser draws an image body whatever the status): it is a failure, so the slide is skipped and never shown (lib/media/placeholder.ts).
    img.onload = () => (isMissingImagePlaceholder(url, img.naturalWidth, img.naturalHeight) ? reject(new Error('image missing')) : resolve(img));
    img.onerror = () => reject(new Error('image failed'));
    img.src = url;
  });
}

/** The browser's own timings of one picture (the last fetch, and how often it was fetched), for the diagnostics. Inline pictures have none. */
function pictureTimings(url: string): { fetches: number; last?: PerformanceResourceTiming } {
  if (url.startsWith('data:')) return { fetches: 0 };
  const entries = performance.getEntriesByName(url) as PerformanceResourceTiming[];
  return { fetches: entries.length, last: entries[entries.length - 1] };
}

export function SlideshowPlayerCore({
  slideshowId,
  instanceKey,
  objectFit = 'contain',
  delayMs: delayMsProp = 0,
  variant = 'fullscreen',
  className = '',
}: SlideshowPlayerCoreProps) {
  const delayMs = normalizeDelayMs(delayMsProp);
  const [settings, setSettings] = useState<SlideshowSettings | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [slideQueue, setSlideQueue] = useState<Slide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  /** A line that tells why the full-screen control does nothing on this device (iPhone Safari has no full screen for a page). */
  const [fullscreenHint, setFullscreenHint] = useState<string | null>(null);
  const [playbackEnded, setPlaybackEnded] = useState(false);
  const [displayEpoch, setDisplayEpoch] = useState(0);
  const [fadeOpaque, setFadeOpaque] = useState(true);
  /** The slide that was on screen before, kept underneath while the next one fades in (crossfade only). */
  const [outgoing, setOutgoing] = useState<Slide | null>(null);
  const shownSlideRef = useRef<Slide | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [preloader] = useState(() => createPreloader<HTMLImageElement>({ load: loadImage }));
  /** Photos whose picture would not load, until when: not asked for again, not queued, for a few minutes. */
  const brokenRef = useRef<Map<string, number>>(new Map());
  /** Photos already reported to the server as not loading, in this page's life: once is enough. */
  const reportedRef = useRef<Set<string>>(new Set());
  const refillBackoffRef = useRef({ ms: 0, until: 0 });
  const loadBackoffRef = useRef(0);
  /** Slides of the first answer that are still loading after the show has started; the refill leaves a gap they will fill alone. */
  const pendingStartRef = useRef(0);
  /** Counts the starts, so what a start left running never reaches the queue of a later one. */
  const loadGenerationRef = useRef(0);
  /** When the page opened and the admin's reload token it opened with and last saw (lib/slideshow/reload.ts): it reloads every 3 hours and when an admin asks. */
  const openedAtRef = useRef(0);
  const openedTokenRef = useRef<string | null>(null);
  const latestTokenRef = useRef<string | null>(null);
  const loadRetryTimerRef = useRef<number | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);
  const pendingInitialDelayRef = useRef(delayMs > 0);
  const onceInitialRef = useRef<Slide[] | null>(null);
  const settingsRef = useRef<SlideshowSettings | null>(null);
  const transitionMsRef = useRef(8000);
  const fadeMsRef = useRef(0);
  const bufferTargetRef = useRef(10);
  const slideQueueRef = useRef<Slide[]>([]);
  /** Slides we can repeat from when the network is down or playlist fetch returns empty (loop mode). */
  const loopSeedSlidesRef = useRef<Slide[] | null>(null);
  const refillBusyRef = useRef(false);
  const isPlayingRef = useRef(true);
  const lastShownRef = useRef<{ key: string; at: number } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  /** Black stage floor until configured failover background image is preloaded / painted */
  const [failoverBgImageReady, setFailoverBgImageReady] = useState(true);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);

  // What the screen reports about itself (camera#476): see useSlideshowDiagnostics.
  const stallHandlerRef = useRef<(stalledMs: number) => void>(() => undefined);
  const { record } = useSlideshowDiagnostics({
    slideshowId,
    variant,
    onStall: (stalledMs) => stallHandlerRef.current(stalledMs),
    getState: () => ({
      active: settingsRef.current !== null && isPlayingRef.current && slideQueueRef.current.length > 0,
      // The stagger of a layout cell or of a delayed start is part of the hold: a stall is judged against the longest hold there can be.
      holdMs: transitionMsRef.current + delayMs,
      queueLen: slideQueueRef.current.length,
      preloaded: preloader.size(),
      busy: refillBusyRef.current,
    }),
  });

  useEffect(() => {
    settingsRef.current = settings;
    if (!settings) return;
    transitionMsRef.current = clampTimingMs(
      settings.transitionDurationMs,
      8000,
      600_000
    );
    fadeMsRef.current = clampTimingMs(settings.fadeDurationMs, 0, 60_000);
    bufferTargetRef.current = totalQueueSlotsFromBufferSize(settings.bufferSize);
  }, [settings]);

  /**
   * The one place the queue is written. The ref is the truth (it changes at once, so the next read in the same tick sees it) and the state
   * mirrors it for drawing. Returns whether the queue changed, so a caller knows if the screen moves on.
   */
  const commitQueue = useCallback((update: (q: Slide[]) => Slide[]): boolean => {
    const prev = slideQueueRef.current;
    const next = update(prev);
    if (next === prev) return false;
    slideQueueRef.current = next;
    setSlideQueue(next);
    return true;
  }, []);

  useEffect(() => {
    pendingInitialDelayRef.current = delayMs > 0;
  }, [slideshowId, delayMs, instanceKey]);

  /** Loads every picture of a slide (bounded, at most a few at a time) and says whether all of them are ready. A photo that fails is remembered as broken for a while. */
  const preloadSlide = useCallback(
    async (slide: Slide, urgent = false, decode = false): Promise<boolean> => {
      const results = await Promise.all(
        slide.submissions.map(async (sub) => {
          const result = await preloader.preload(sub.imageUrl, { urgent });
          if (result.ok) {
            // decode() can reject for a picture the browser can still draw; the show does not depend on it.
            if (decode) await result.value.decode().catch(() => undefined);
            brokenRef.current.delete(sub._id);
            if (result.ms > 0) record('preload', { ms: result.ms, outcome: 'ok', bytes: pictureTimings(sub.imageUrl).last?.transferSize || undefined, host: hostOf(sub.imageUrl) });
          } else {
            if (result.ms > 0) record('preload', { ms: result.ms, outcome: result.reason, host: hostOf(sub.imageUrl) });
            brokenRef.current.set(sub._id, Date.now() + PRELOAD_FAIL_TTL_MS);
            // A picture that failed outright (not one that was only slow) is reported: the server asks the picture's host itself, and if it is really gone the photo is hidden everywhere,
            // not only here and not only for a few minutes (lib/media/broken.ts). The report never holds the show up.
            if (result.reason === 'error' && result.ms > 0 && !reportedRef.current.has(sub._id) && reportedRef.current.size < 200) {
              reportedRef.current.add(sub._id);
              void fetch('/api/media/broken', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId: sub._id }), keepalive: true }).catch(() => undefined);
            }
          }
          return result.ok;
        })
      );
      return results.every(Boolean);
    },
    [preloader, record]
  );

  /** The photos not to be asked for again at once. */
  const brokenIds = useCallback((): string[] => {
    const now = Date.now();
    for (const [id, until] of brokenRef.current) if (until <= now) brokenRef.current.delete(id);
    return [...brokenRef.current.keys()];
  }, []);

  const fetchPlaylistChunk = useCallback(
    async (limit: number, exclude: string[] = []): Promise<{ slides: Slide[]; status: number; ms: number; serverMs?: number; reloadToken?: string | null }> => {
      const lim = Math.max(1, Math.min(50, Math.floor(limit)));
      const startedAt = performance.now();
      try {
        const qs = new URLSearchParams({ limit: String(lim) });
        if (exclude.length > 0) qs.set('exclude', exclude.join(','));
        if (instanceKey?.trim()) {
          qs.set('instanceKey', instanceKey.trim().slice(0, 256));
        }
        const { status, data } = await fetchWithTimeout(
          `/api/slideshows/${slideshowId}/playlist?${qs.toString()}`,
          { cache: 'no-store' },
          API_TIMEOUT_MS,
          async (response) => ({ status: response.status, data: response.ok ? await response.json() : null })
        );
        if (!data) return { slides: [], status, ms: performance.now() - startedAt };
        return { slides: (data.playlist || []) as Slide[], status, ms: performance.now() - startedAt, serverMs: data.diagnostics?.generationMs, reloadToken: data.slideshow?.reloadToken ?? null };
      } catch {
        return { slides: [], status: 0, ms: performance.now() - startedAt };
      }
    },
    [slideshowId, instanceKey]
  );

  /**
   * Top the loop queue up to its target depth. A full queue asks the server nothing. A refill tells the server which photos the queue
   * holds (and which pictures would not load) and appends only photos it does not hold, each as soon as its picture is ready; when the
   * server has nothing new (a pool smaller than the queue, or no network) the loop goes on from the slides already seen.
   * Every wait is bounded: a request gives up after 8 s, a picture after 20 s, the lock is released after 20 s whatever is in flight, and
   * after a failed answer the next refill waits 1, 2, 4, 8, then 15 s (camera#476).
   */
  const maintainLoopBuffer = useCallback(async () => {
    const s = settingsRef.current;
    if (!s || s.playMode === 'once') return;
    if (refillBusyRef.current) return;
    if (slideQueueRef.current.length + pendingStartRef.current >= bufferTargetRef.current) return;
    if (Date.now() < refillBackoffRef.current.until) return;
    refillBusyRef.current = true;
    const lockedAt = performance.now();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      refillBusyRef.current = false;
      record('lock', { ms: performance.now() - lockedAt });
    };
    const deadline = window.setTimeout(release, REFILL_LOCK_MAX_MS);
    try {
      const target = bufferTargetRef.current;
      for (let round = 0; round < 12 && !released; round++) {
        const queue = slideQueueRef.current;
        if (queue.length >= target) break;
        const limit = Math.min(target - queue.length, 25);
        const exclude = excludeIds(queue, brokenIds());
        const { slides: answer, status, ms, serverMs, reloadToken } = await fetchPlaylistChunk(limit, exclude);
        if (reloadToken !== undefined) latestTokenRef.current = reloadToken;
        const fresh = freshSlides(slideQueueRef.current, answer);
        record('playlist', { limit, excl: exclude.length, status, ms, got: answer.length, fresh: fresh.length, serverMs });
        const backoffMs = nextBackoffMs(refillBackoffRef.current.ms, status === 200);
        refillBackoffRef.current = { ms: backoffMs, until: Date.now() + backoffMs };
        const loaded: Slide[] = [];
        await Promise.all(
          fresh.map(async (sl) => {
            if (!(await preloadSlide(sl))) return;
            loaded.push(sl);
            commitQueue((q) => appendFresh(q, [sl], target));
          })
        );
        if (loaded.length > 0) loopSeedSlidesRef.current = mergeSeed(loopSeedSlidesRef.current, loaded);
        if (loaded.length === 0) {
          commitQueue((q) => appendFromSeed(q, loopSeedSlidesRef.current, target));
          break;
        }
      }
    } finally {
      window.clearTimeout(deadline);
      release();
    }
  }, [fetchPlaylistChunk, preloadSlide, brokenIds, commitQueue, record]);

  const loadInitialBuffer = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setPlaybackEnded(false);
      pendingInitialDelayRef.current = delayMs > 0;
      onceInitialRef.current = null;

      const initialQs = new URLSearchParams();
      if (instanceKey?.trim()) {
        initialQs.set('instanceKey', instanceKey.trim().slice(0, 256));
      }
      const initialQuery = initialQs.toString();
      const playlistUrl =
        initialQuery.length > 0
          ? `/api/slideshows/${slideshowId}/playlist?${initialQuery}`
          : `/api/slideshows/${slideshowId}/playlist`;
      const loadStartedAt = performance.now();
      const { status, data } = await fetchWithTimeout(playlistUrl, { cache: 'no-store' }, API_TIMEOUT_MS, async (response) => ({
        status: response.status,
        data: response.ok ? await response.json() : null,
      }));
      if (!data) {
        throw new Error(`Failed to load slideshow: ${status}`);
      }

      const got = Array.isArray(data.playlist) ? data.playlist.length : 0;
      record('playlist', { limit: 0, excl: 0, status, ms: performance.now() - loadStartedAt, got, fresh: got, serverMs: data.diagnostics?.generationMs });

      if (!data.slideshow || !data.playlist) {
        throw new Error('Invalid slideshow data');
      }

      // `settings` is set only when the show starts: while the screen still shows its loading picture, nothing may count a slide as played,
      // start a hold timer or refill the queue (a refill used to fill it, and the head was counted as played, at the first 2.5 s tick).
      bufferTargetRef.current = totalQueueSlotsFromBufferSize(data.slideshow.bufferSize);
      openedTokenRef.current = data.slideshow.reloadToken ?? null;
      latestTokenRef.current = openedTokenRef.current;
      const generation = ++loadGenerationRef.current;
      pendingStartRef.current = 0;

      // The loading-screen logo and the failover background are not waited for: they must not hold the first picture back.
      if (data.slideshow.eventId) {
        void fetchWithTimeout(`/api/events/${data.slideshow.eventId}/logos`, {}, LOGO_TIMEOUT_MS, async (r) => (r.ok ? r.json() : null))
          .then((logoData) => {
            const loadingLogos = logoData?.data?.logos?.['loading-slideshow'] || logoData?.logos?.['loading-slideshow'] || [];
            // One logo is used as it is; several are picked at random (camera#419).
            const activeLogo = pickRandom<{ isActive?: boolean; imageUrl?: string }>(loadingLogos.filter((l: { isActive?: boolean }) => l.isActive));
            if (activeLogo?.imageUrl) setLogoUrl(activeLogo.imageUrl);
          })
          .catch(() => undefined);
      }
      const failoverBgUrl = (data.slideshow.backgroundImageUrl || '').trim();
      setFailoverBgImageReady(!failoverBgUrl);
      if (failoverBgUrl) {
        // A background that will not load (or is too slow) shows the gradient below it.
        void preloader.preload(failoverBgUrl, { urgent: true }).then(() => setFailoverBgImageReady(true));
      }

      // The screen design's picture is loaded with the first slides, so the design does not pop in after the photos.
      const overlayUrl: string | undefined = data.slideshow.screenDesign?.overlayImageUrl;
      const overlayReady = overlayUrl
        ? Promise.race([preloader.preload(overlayUrl, { urgent: true }), new Promise((resolve) => setTimeout(resolve, OVERLAY_WAIT_MS))])
        : Promise.resolve();

      const received = (data.playlist || []) as Slide[];
      const isOnce = data.slideshow.playMode === 'once';
      // Loop: the first START_SLIDES are loaded at once, the rest of the answer behind them (a few at a time); the show starts on the first ones.
      // Once: the whole pass must be there, as it has an end.
      const startCount = isOnce ? received.length : Math.min(START_SLIDES, received.length);
      const loading = received.map((sl, i) => preloadSlide(sl, i < startCount));
      const firstFlags = await Promise.all(loading.slice(0, startCount));
      await overlayReady;
      let playlist: Slide[];
      let rest: Array<{ slide: Slide; loaded: Promise<boolean> }> = [];
      if (firstFlags.every(Boolean)) {
        playlist = received.slice(0, startCount);
        rest = received.slice(startCount).map((slide, i) => ({ slide, loaded: loading[startCount + i] }));
      } else {
        // A first slide failed: wait for the whole answer, and start on what loaded (a slide that fails is out for a few minutes; the refill fills the gap).
        const flags = await Promise.all(loading);
        playlist = received.filter((_, i) => flags[i]);
        if (received.length > 0 && playlist.length === 0) throw new Error('No picture could be loaded');
      }
      if (generation !== loadGenerationRef.current) return;

      settingsRef.current = data.slideshow;
      setSettings(data.slideshow);
      if (playlist.length > 0) {
        setDisplayEpoch(0);
        commitQueue(() => playlist);
        if (isOnce) {
          loopSeedSlidesRef.current = null;
          onceInitialRef.current = playlist.map((sl) => ({
            ...sl,
            submissions: sl.submissions.map((s) => ({ ...s })),
          }));
        } else {
          loopSeedSlidesRef.current = mergeSeed(null, playlist);
          pendingStartRef.current = rest.length;
          for (const { slide, loaded } of rest) {
            void loaded.then((ok) => {
              if (generation !== loadGenerationRef.current) return;
              pendingStartRef.current -= 1;
              if (ok) {
                loopSeedSlidesRef.current = mergeSeed(loopSeedSlidesRef.current, [slide]);
                commitQueue((q) => appendFresh(q, [slide], bufferTargetRef.current));
              }
              // The whole first answer is in (or failed): fill any gap the usual way.
              if (pendingStartRef.current === 0) void maintainLoopBuffer();
            });
          }
          void maintainLoopBuffer();
        }
      } else {
        loopSeedSlidesRef.current = null;
        setDisplayEpoch(0);
        commitQueue(() => []);
      }

      loadBackoffRef.current = 0;
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load initial buffer:', err);
      record('error', { msg: `load: ${err instanceof Error ? err.message : 'failed'}` });
      setError(err instanceof Error ? err.message : 'Failed to load slideshow');
      setIsLoading(false);
      // A screen that cannot start tries again by itself (1, 2, 4, 8, then every 15 s) instead of waiting for someone to reload it.
      loadBackoffRef.current = nextBackoffMs(loadBackoffRef.current, false);
      loadRetryTimerRef.current = window.setTimeout(() => void loadRef.current(), loadBackoffRef.current);
    }
  }, [slideshowId, instanceKey, preloader, preloadSlide, maintainLoopBuffer, commitQueue, record, delayMs]);

  useLayoutEffect(() => {
    if (!settings) return;

    if (variant === 'fullscreen') {
      const mode = viewportModeForStage(
        variant,
        objectFit,
        settings.viewportScale
      );
      const measure = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const ar =
          typeof settings.stageAspect === 'number' &&
          Number.isFinite(settings.stageAspect) &&
          settings.stageAspect > 0
            ? settings.stageAspect
            : 16 / 9;
        setStageSize(slideshowStageDimensions(w, h, mode, ar));
      };
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    // Embedded: grid cell size is authoritative (rigid (span×16):(span×9) from layout).
    // Canvas uses CSS 100%×100%; no ResizeObserver, no 16:9 letterboxing inside the cell.
    setStageSize({ width: 0, height: 0 });
    return undefined;
  }, [variant, objectFit, settings, slideshowId]);

  useEffect(() => {
    loadRef.current = loadInitialBuffer;
    void loadInitialBuffer();
    return () => {
      if (loadRetryTimerRef.current !== null) window.clearTimeout(loadRetryTimerRef.current);
      loadRetryTimerRef.current = null;
    };
  }, [loadInitialBuffer]);

  // Keep the first slides of the queue loaded (ready ones cost nothing) and let go of pictures the queue no longer holds, so memory does not grow for hours.
  useEffect(() => {
    preloader.prune(new Set(slideQueue.flatMap((sl) => sl.submissions.map((sub) => sub.imageUrl))));
    slideQueue.slice(0, PRELOAD_AHEAD).forEach((sl, i) => void preloadSlide(sl, false, i < DECODE_AHEAD));
  }, [slideQueue, preloader, preloadSlide]);

  const updatePlayCounts = useCallback(
    async (slide: Slide) => {
      try {
        const submissionIds = slide.submissions.map((s) => s._id);
        const status = await fetchWithTimeout(
          `/api/slideshows/${slideshowId}/played`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionIds }) },
          API_TIMEOUT_MS,
          async (response) => response.status
        );
        if (status < 200 || status > 299) {
          console.warn(`[PlayCount] API returned ${status}`);
        }
      } catch (err) {
        console.error('[PlayCount] ERROR:', err);
      }
    },
    [slideshowId]
  );

  const headSlide = slideQueue[0];

  useEffect(() => {
    if (!settings || !isPlaying || !headSlide) return;

    updatePlayCounts(headSlide);

    const useEmbeddedStagger = variant === 'embedded' && delayMs > 0;
    const useFullscreenInitialStagger =
      variant === 'fullscreen' &&
      displayEpoch === 0 &&
      pendingInitialDelayRef.current &&
      delayMs > 0;
    const delayExtra =
      useEmbeddedStagger || useFullscreenInitialStagger ? delayMs : 0;
    const holdMs = transitionMsRef.current + delayExtra;

    const advanceTimer = setTimeout(() => {
      if (useFullscreenInitialStagger) {
        pendingInitialDelayRef.current = false;
      }

      const sNow = settingsRef.current;
      const playMode = sNow?.playMode === 'once' ? 'once' : 'loop';

      if (playMode === 'once') {
        if (slideQueueRef.current.length <= 1) {
          setPlaybackEnded(true);
          setIsPlaying(false);
          return;
        }
        commitQueue((q) => q.slice(1));
        setDisplayEpoch((e) => e + 1);
        return;
      }

      // At a slide boundary, so no picture is cut: reload every 3 hours and when an admin asked (lib/slideshow/reload.ts).
      const reason = reloadReason({ variant, openedAt: openedAtRef.current, now: Date.now(), token: latestTokenRef.current, openedToken: openedTokenRef.current });
      if (reason) {
        record('error', { msg: `reload: ${reason}` });
        window.location.reload();
        return;
      }

      if (commitQueue((q) => advanceLoop(q, loopSeedSlidesRef.current, bufferTargetRef.current))) {
        setDisplayEpoch((e) => e + 1);
      }
      void maintainLoopBuffer();
    }, holdMs);

    return () => {
      clearTimeout(advanceTimer);
    };
  }, [
    settings,
    headSlide,
    isPlaying,
    delayMs,
    displayEpoch,
    variant,
    updatePlayCounts,
    maintainLoopBuffer,
    commitQueue,
    record,
  ]);

  useEffect(() => {
    if (!settings || settings.playMode === 'once' || !isPlaying) return;
    const id = window.setInterval(() => {
      void maintainLoopBuffer();
    }, 2500);
    return () => clearInterval(id);
  }, [settings, isPlaying, maintainLoopBuffer, slideshowId]);

  /** If the queue drained (e.g. race) while looping, restore from seed so auto-advance can resume. */
  useEffect(() => {
    if (!settings || settings.playMode === 'once' || !isPlaying) return;
    if (slideQueue.length > 0) return;
    const seed = loopSeedSlidesRef.current;
    if (!seed?.length) return;
    const target = bufferTargetRef.current;
    commitQueue((q) => advanceLoop(q, seed, target));
    void maintainLoopBuffer();
  }, [settings, isPlaying, slideQueue.length, maintainLoopBuffer, commitQueue]);

  useEffect(() => {
    if (!settings || settings.playMode === 'once' || !isPlaying) return;
    const onOnline = () => void maintainLoopBuffer();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [settings, isPlaying, maintainLoopBuffer]);

  const fadeMsForUi =
    settings == null
      ? 0
      : clampTimingMs(settings.fadeDurationMs, 0, 60_000);
  const headFadeKey =
    settings && headSlide ? `${displayEpoch}:${slideKey(headSlide)}` : '';

  // Each slide that becomes the one on screen is reported: a repeat, the gap since the last, and how its picture reached the screen.
  useEffect(() => {
    const head = headFadeKey ? slideQueueRef.current[0] : undefined;
    if (!head) return;
    const sub = head.submissions[0];
    const now = performance.now();
    const key = slideKey(head);
    const { fetches, last } = pictureTimings(sub.imageUrl);
    const preloaded = preloader.get(sub.imageUrl);
    record('slide_shown', {
      id: shortId(sub._id),
      dup: lastShownRef.current?.key === key,
      q: slideQueueRef.current.length,
      gapMs: lastShownRef.current ? now - lastShownRef.current.at : undefined,
      fetches,
      loadMs: last?.duration,
      bytes: last?.transferSize || undefined,
      nw: preloaded?.naturalWidth,
      nh: preloaded?.naturalHeight,
      host: hostOf(sub.imageUrl),
      preloaded: preloaded !== undefined,
    });
    lastShownRef.current = { key, at: now };
  }, [headFadeKey, preloader, record]);

  // Crossfade: the slide that was shown stays underneath until the next one has faded in over it (then it is dropped, so only two pictures are ever drawn).
  const crossfade = settings?.crossfade === true;
  useEffect(() => {
    const head = headFadeKey ? slideQueueRef.current[0] : undefined;
    const previous = shownSlideRef.current;
    shownSlideRef.current = head ?? null;
    if (!crossfade || !previous || !head || displayEpoch === 0 || fadeMsForUi <= 0) {
      setOutgoing(null);
      return;
    }
    setOutgoing(previous);
    const done = window.setTimeout(() => setOutgoing(null), fadeMsForUi + 80);
    return () => window.clearTimeout(done);
  }, [headFadeKey, crossfade, displayEpoch, fadeMsForUi]);

  useLayoutEffect(() => {
    if (!headFadeKey) {
      setFadeOpaque(true);
      return;
    }
    if (fadeMsForUi <= 0) {
      setFadeOpaque(true);
      return;
    }
    if (displayEpoch === 0) {
      setFadeOpaque(true);
      return;
    }
    setFadeOpaque(false);
    const raf = requestAnimationFrame(() => {
      setFadeOpaque(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [headFadeKey, fadeMsForUi, displayEpoch]);

  const toggleFullscreen = useCallback(() => {
    if (variant !== 'fullscreen' || !containerRef.current) return;
    if (typeof containerRef.current.requestFullscreen !== 'function') {
      // iPhone Safari has no full screen for a page: the Home Screen app is the way, and the show goes on either way.
      setFullscreenHint('On an iPhone: tap Share, then Add to Home Screen, and open the screen from there without the browser bars.');
      window.setTimeout(() => setFullscreenHint(null), 9000);
      return;
    }
    // A browser may refuse; the show goes on either way.
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen()?.catch(() => undefined);
    } else {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [variant]);

  // The controls (pause, full screen) are a transparent bar at the bottom of the picture, like a media player's: they show when the pointer moves or the screen is touched, for a few
  // seconds when the page opens, and fade away when nothing happens (the pointer too, in full screen). This is the control the player had before the GDS migration of 2026-05-29 moved it
  // into a card; camera#487 added a second button on top instead of putting this one back.
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimerRef = useRef<number | null>(null);
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }, []);
  // Shown for a few seconds when the show starts (and when the page opens), so it is clear there are controls.
  const started = settings !== null;
  useEffect(() => {
    wakeControls();
    return () => {
      if (controlsTimerRef.current !== null) window.clearTimeout(controlsTimerRef.current);
    };
  }, [wakeControls, started]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const manualAdvance = useCallback(() => {
    pendingInitialDelayRef.current = false;
    const s = settingsRef.current;
    const playMode = s?.playMode === 'once' ? 'once' : 'loop';
    setPlaybackEnded(false);

    if (playMode === 'once') {
      if (commitQueue((q) => (q.length <= 1 ? q : q.slice(1)))) setDisplayEpoch((e) => e + 1);
      return;
    }

    if (commitQueue((q) => advanceLoop(q, loopSeedSlidesRef.current, bufferTargetRef.current))) {
      setDisplayEpoch((e) => e + 1);
    }
    void maintainLoopBuffer();
  }, [maintainLoopBuffer, commitQueue]);

  const manualBack = useCallback(() => {
    pendingInitialDelayRef.current = false;
    setPlaybackEnded(false);
    commitQueue((q) => {
      if (q.length < 2) return q;
      const last = q[q.length - 1];
      return [last, ...q.slice(0, -1)];
    });
    setDisplayEpoch((e) => e + 1);
    const s = settingsRef.current;
    if (s && s.playMode !== 'once') {
      void maintainLoopBuffer();
    }
  }, [maintainLoopBuffer, commitQueue]);

  // The screen recovers from a stall by itself (lib/slideshow/watchdog.ts): next slide first, a reload if it has stood still for a minute
  // (a full-screen page only, at most 3 times in 10 minutes). The stall has been reported to the server before this runs.
  useEffect(() => {
    stallHandlerRef.current = (stalledMs) => {
      const key = `slideshow-reloads:${slideshowId}`;
      const now = Date.now();
      let reloads: number[] = [];
      try {
        reloads = recentReloads(sessionStorage.getItem(key), now);
      } catch {
        /* no session storage: no history, the cap cannot be kept, so no reload */
        reloads = [now, now, now];
      }
      if (variant === 'fullscreen' && watchdogAction(stalledMs, reloads, now) === 'reload') {
        try {
          sessionStorage.setItem(key, JSON.stringify([...reloads, now]));
        } catch {
          /* checked above */
        }
        record('error', { msg: 'watchdog: reload' });
        window.location.reload();
        return;
      }
      record('error', { msg: 'watchdog: next slide' });
      manualAdvance();
    };
  }, [slideshowId, variant, record, manualAdvance]);

  // Keep the display awake while the show runs (a browser asks again after the page has been hidden).
  useEffect(() => {
    if (variant !== 'fullscreen') return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const next = (await navigator.wakeLock?.request('screen')) ?? null;
        if (stopped) void next?.release().catch(() => undefined);
        else lock = next;
      } catch {
        /* not supported, or refused (battery saver): the show does not depend on it */
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== 'fullscreen') return;
    const handleKeyPress = (e: KeyboardEvent) => {
      wakeControls();
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'ArrowRight' && slideQueue.length > 0) {
        manualAdvance();
      } else if (e.key === 'ArrowLeft' && slideQueue.length > 0) {
        manualBack();
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [variant, slideQueue.length, manualAdvance, manualBack, toggleFullscreen, wakeControls]);

  const primary = settings?.backgroundPrimaryColor?.trim() || DEFAULT_BG_PRIMARY;
  const accent = settings?.backgroundAccentColor?.trim() || DEFAULT_BG_ACCENT;
  const bgImageUrl = settings?.backgroundImageUrl?.trim() || '';

  const failoverBackgroundStyle: CSSProperties = {
    background: `linear-gradient(to bottom left, ${primary}, ${accent})`,
  };

  const stageBackdropStyle: CSSProperties =
    bgImageUrl && !failoverBgImageReady
      ? { background: CAMERA_STAGE_BLACK }
      : failoverBackgroundStyle;

  const outerStateClass =
    variant === 'fullscreen' ? 'w-screen h-screen' : 'w-full h-full min-h-0 min-w-0';

  if (isLoading) {
    return (
      <div className={`${outerStateClass} overflow-hidden relative flex items-center justify-center ${className}`} aria-busy="true">
        <SlideshowDebugPanel />
        {logoUrl ? <img src={logoUrl} alt="" className="max-h-24 max-w-xs object-contain" /> : null}
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className={`${outerStateClass} overflow-hidden relative flex items-center justify-center ${className}`}>
        <div className="text-center text-sm md:text-xl px-2" style={{ color: 'var(--event-heading, currentColor)' }}>
          {error || 'Slideshow not found'}
        </div>
      </div>
    );
  }

  const currentSlide = headSlide;

  const fit = settings?.screenDesign?.photoFit ?? objectFit;

  const renderSlide = (slide: Slide) => {
    if (slide.type === 'single') {
      return (
        <img
          src={slide.submissions[0].imageUrl}
          alt="Slideshow"
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            padding: 0,
            margin: 0,
          }}
        />
      );
    }
    if (slide.aspectRatio === '1:1') {
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {[
            ['0%', '0%', '33.333%', '50%', 'flex-start', 'flex-start'],
            ['33.333%', '0%', '33.333%', '50%', 'flex-start', 'center'],
            ['66.666%', '0%', '33.333%', '50%', 'flex-start', 'flex-end'],
            ['0%', '50%', '33.333%', '50%', 'flex-end', 'flex-start'],
            ['33.333%', '50%', '33.333%', '50%', 'flex-end', 'center'],
            ['66.666%', '50%', '33.333%', '50%', 'flex-end', 'flex-end'],
          ].map(([left, top, w, h, ai, jc], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left,
                top,
                width: w,
                height: h,
                display: 'flex',
                alignItems: ai as 'flex-start' | 'flex-end',
                justifyContent: jc as 'flex-start' | 'flex-end' | 'center',
                overflow: 'hidden',
              }}
            >
              <img
                src={slide.submissions[i].imageUrl}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: fit }}
              />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {[
          ['0%', 'flex-start'],
          ['33.333%', 'center'],
          ['66.666%', 'flex-end'],
        ].map(([left, jc], i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left,
              top: '0%',
              width: '33.333%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: jc as 'flex-start' | 'flex-end' | 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src={slide.submissions[i].imageUrl}
              alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: fit }}
            />
          </div>
        ))}
      </div>
    );
  };

  const sw = stageSize.width;
  const sh = stageSize.height;
  const hasStage = sw > 0 && sh > 0;

  const screenDesign = settings?.screenDesign ?? null;
  const stageBaseStyle: CSSProperties =
        variant === 'embedded'
          ? { position: 'relative', width: '100%', height: '100%' }
          : variant === 'fullscreen'
            ? hasStage
              ? {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: sw,
                  height: sh,
                }
              : {
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '100vw',
                  height: '56.25vw',
                  maxWidth: '177.78vh',
                  maxHeight: '100vh',
                }
            : {};
  // The design's sizes are fractions of the stage, so the stage is a size container (cqh/cqw units).
  const stageStyle: CSSProperties = screenDesign ? { ...stageBaseStyle, containerType: 'size' } : stageBaseStyle;

  const canvasInner = (
    <div
      className={
        variant === 'fullscreen'
          ? 'relative overflow-hidden'
          : 'relative h-full w-full overflow-hidden'
      }
      style={stageStyle}
    >
      <div className="absolute inset-0 z-0" style={stageBackdropStyle} aria-hidden />
      {bgImageUrl ? (
        <img
          src={bgImageUrl}
          alt=""
          className="absolute inset-0 z-[1] h-full w-full object-cover pointer-events-none"
          onLoad={() => setFailoverBgImageReady(true)}
          onError={() => setFailoverBgImageReady(true)}
        />
      ) : null}

      <div
        className={screenDesign ? 'absolute z-[2] flex items-center justify-center overflow-hidden' : 'absolute inset-0 z-[2] flex items-center justify-center'}
        style={screenDesign ? screenWindowStyle(screenDesign) : undefined}
      >
        {currentSlide && crossfade ? (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {outgoing ? (
              <div key={`out:${slideKey(outgoing)}`} data-slide-layer="outgoing" style={{ position: 'absolute', inset: 0 }}>
                {renderSlide(outgoing)}
              </div>
            ) : null}
            {/* A new layer for each slide: it appears at opacity 0 and fades in over the one underneath. */}
            <div
              key={`in:${headFadeKey}`}
              data-slide-layer="incoming"
              style={{
                position: 'absolute',
                inset: 0,
                opacity: fadeOpaque ? 1 : 0,
                transition: fadeMsForUi > 0 ? `opacity ${fadeMsForUi}ms ease-in-out` : undefined,
              }}
            >
              {renderSlide(currentSlide)}
            </div>
          </div>
        ) : currentSlide ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              opacity: fadeOpaque ? 1 : 0,
              transition:
                fadeMsForUi > 0
                  ? `opacity ${fadeMsForUi}ms ease-in-out`
                  : undefined,
            }}
          >
            {renderSlide(currentSlide)}
          </div>
        ) : (
          <div className="text-center px-4 max-w-lg" style={{ color: 'var(--event-heading, currentColor)' }}>
            <div className="text-2xl md:text-4xl mb-2 md:mb-4">📸</div>
            <div className="mt-1 md:mt-2 text-xs md:text-base">No submissions yet</div>
          </div>
        )}
      </div>
      {screenDesign ? <ScreenDesignLayers design={screenDesign} /> : null}

    </div>
  );

  const controlButton = { background: 'none', border: 0, padding: '0.5rem', color: 'inherit', cursor: 'pointer', display: 'flex', borderRadius: 999 } as const;
  const playbackControls =
    variant === 'fullscreen' ? (
      <div
        data-playback-controls
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 40,
          padding: '2.5rem 1.5rem max(1rem, env(safe-area-inset-bottom))',
          background: `linear-gradient(to top, color-mix(in srgb, ${CAMERA_STAGE_BLACK} 80%, transparent), transparent)`,
          opacity: controlsVisible || fullscreenHint ? 1 : 0,
          pointerEvents: controlsVisible ? 'auto' : 'none',
          transition: 'opacity 300ms',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', maxWidth: '80rem', margin: '0 auto', color: CAMERA_STAGE_WHITE }}>
          <button
            type="button"
            style={controlButton}
            tabIndex={controlsVisible ? 0 : -1}
            onClick={() => {
              if (playbackEnded && onceInitialRef.current?.length) {
                pendingInitialDelayRef.current = delayMs > 0;
                commitQueue(() =>
                  (onceInitialRef.current ?? []).map((sl) => ({
                    ...sl,
                    submissions: sl.submissions.map((sub) => ({ ...sub })),
                  }))
                );
                setPlaybackEnded(false);
                setIsPlaying(true);
                setDisplayEpoch(0);
                return;
              }
              setIsPlaying(!isPlaying);
            }}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {fullscreenHint ? (
            <span role="status" style={{ flex: 1, textAlign: 'center', fontSize: '0.9rem' }}>
              {fullscreenHint}
            </span>
          ) : null}
          <button type="button" data-fullscreen-button style={controlButton} tabIndex={controlsVisible ? 0 : -1} onClick={toggleFullscreen} title="Full screen (F, or double-click the picture)" aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}>
            {isFullscreen ? (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    ) : null;

  const playbackOverlays = playbackEnded && currentSlide ? (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center"
      style={{ background: `color-mix(in srgb, ${CAMERA_STAGE_BLACK} 60%, transparent)`, color: CAMERA_STAGE_WHITE }}
    >
      <p className="text-lg md:text-2xl font-semibold">Playback complete</p>
      <p className="text-sm mt-2" style={{ opacity: 0.8 }}>Press play to start again</p>
    </div>
  ) : null;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={settings.name}
      className={`${outerStateClass} overflow-hidden relative ${className}${variant === 'fullscreen' ? ' flex items-center justify-center' : ''}`}
      style={{ ...failoverBackgroundStyle, ...(variant === 'fullscreen' && isFullscreen && !controlsVisible ? { cursor: 'none' } : {}) }}
      onMouseMove={wakeControls}
      onPointerDown={wakeControls}
      onDoubleClick={variant === 'fullscreen' ? toggleFullscreen : undefined}
    >
      <SlideshowDebugPanel />
      {variant === 'fullscreen' ? (
        canvasInner
      ) : (
        <div className="absolute inset-0" style={failoverBackgroundStyle}>
          {canvasInner}
        </div>
      )}
      {playbackOverlays}
      {playbackControls}
      {currentSlide ? (
        <span className="sr-only" role="status">
          {`${settings.eventName} · ${isPlaying ? 'Playing' : 'Paused'}`}
        </span>
      ) : null}
    </div>
  );
}
