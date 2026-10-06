/**
 * Turns the logged capture diagnostics (camera#204) into a per browser / device summary, so the
 * rate of black frames and the start-up timings can be compared across devices. Pure and
 * DOM-free; scripts/camera-diagnostics-report.ts is the thin command-line wrapper.
 */

import type { CameraDiagnostic } from './diagnostics';

export interface DiagnosticRecord {
  diagnostic: CameraDiagnostic;
  userAgent?: string;
  timestamp?: string;
}

export interface ParsedUserAgent {
  browser: string;
  os: string;
  device: string;
}

/** Accepted photos with a mean brightness below this are counted as "dark". */
export const DARK_MEAN_THRESHOLD = 20;

const LOG_EVENT = 'camera.capture_diagnostic';

export function parseUserAgent(ua?: string): ParsedUserAgent {
  const agent = ua ?? '';

  let browser = 'Other';
  if (/Instagram/i.test(agent)) browser = 'Instagram in-app';
  else if (/FBAN|FBAV/.test(agent)) browser = 'Facebook in-app';
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(agent)) browser = 'TikTok in-app';
  else if (/SamsungBrowser\/(\d+)/.test(agent)) browser = `Samsung Internet ${RegExp.$1}`;
  else if (/EdgA?\/(\d+)|Edg\/(\d+)/.test(agent)) browser = `Edge ${RegExp.$1 || RegExp.$2}`;
  else if (/OPR\/(\d+)/.test(agent)) browser = `Opera ${RegExp.$1}`;
  else if (/CriOS\/(\d+)/.test(agent)) browser = `Chrome iOS ${RegExp.$1}`;
  else if (/FxiOS\/(\d+)/.test(agent)) browser = `Firefox iOS ${RegExp.$1}`;
  else if (/Firefox\/(\d+)/.test(agent)) browser = `Firefox ${RegExp.$1}`;
  else if (/Chrome\/(\d+)/.test(agent)) browser = `Chrome ${RegExp.$1}`;
  else if (/Version\/(\d+).*Safari/.test(agent)) browser = `Safari ${RegExp.$1}`;

  let os = 'Other';
  let device = 'desktop';
  if (/iPhone|iPod/.test(agent)) {
    os = /OS (\d+)_/.test(agent) ? `iOS ${RegExp.$1}` : 'iOS';
    device = 'iPhone';
  } else if (/iPad/.test(agent)) {
    os = /OS (\d+)_/.test(agent) ? `iPadOS ${RegExp.$1}` : 'iPadOS';
    device = 'iPad';
  } else if (/Android/.test(agent)) {
    os = /Android (\d+)/.test(agent) ? `Android ${RegExp.$1}` : 'Android';
    const model = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?\)/.exec(agent)?.[1]?.trim();
    // Chrome's reduced user agent reports the model as a single letter such as "K".
    device = model && model.length > 1 ? model : 'Android (model hidden)';
  } else if (/Mac OS X/.test(agent)) {
    os = 'macOS';
  } else if (/Windows/.test(agent)) {
    os = 'Windows';
  } else if (/CrOS/.test(agent)) {
    os = 'ChromeOS';
  } else if (/Linux/.test(agent)) {
    os = 'Linux';
  }

  return { browser, os, device };
}

/** Pulls diagnostic records out of raw log lines; tolerates a wrapper object with a `message`. */
export function extractRecords(lines: Iterable<string>): DiagnosticRecord[] {
  const records: DiagnosticRecord[] = [];

  const tryParse = (text: string): unknown => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  };

  for (const line of lines) {
    if (!line.includes(LOG_EVENT)) continue;
    let parsed = tryParse(line) as Record<string, unknown> | null;
    if (parsed && typeof parsed.message === 'string' && parsed.event !== LOG_EVENT) {
      parsed = tryParse(parsed.message) as Record<string, unknown> | null;
    }
    if (!parsed || parsed.event !== LOG_EVENT) continue;

    const context = parsed.context as { diagnostic?: CameraDiagnostic; userAgent?: string } | undefined;
    if (!context?.diagnostic) continue;
    records.push({
      diagnostic: context.diagnostic,
      userAgent: context.userAgent,
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : undefined,
    });
  }

  return records;
}

export type GroupBy = 'browser' | 'device' | 'testRun';

export interface ReportRow {
  group: string;
  /** Distinct page loads (random session ids) that started a camera. */
  sessions: number;
  /** Camera starts (a retake or a switch starts a new stream in the same session). */
  streams: number;
  captures: number;
  ok: number;
  notReady: number;
  failed: number;
  /** Captures that met at least one broken (near-black, flat) frame before the photo. */
  withBrokenFrames: number;
  /** Accepted photos darker than DARK_MEAN_THRESHOLD on average. */
  dark: number;
  /** Streams whose shutter unlocked by timeout because no frame event arrived. */
  noFrameEvent: number;
  medianFirstFrameMs?: number;
  medianShutterUnlockMs?: number;
  medianShutterDelayMs?: number;
  /** Most common granted camera mode, "WxH". */
  commonMode?: string;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function groupKey(record: DiagnosticRecord, by: GroupBy): string {
  if (by === 'testRun') return record.diagnostic.testRun ?? '(no test label)';
  const ua = parseUserAgent(record.userAgent);
  return by === 'device' ? ua.device : `${ua.browser} / ${ua.os}`;
}

export function summarize(records: DiagnosticRecord[], by: GroupBy = 'browser'): ReportRow[] {
  const groups = new Map<string, DiagnosticRecord[]>();
  for (const record of records) {
    const key = groupKey(record, by);
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }

  const rows: ReportRow[] = [];
  for (const [group, items] of groups) {
    const streams = items.filter((r) => r.diagnostic.kind === 'stream_started');
    const captures = items.filter((r) => r.diagnostic.kind === 'capture');
    const modes = new Map<string, number>();
    for (const s of streams) {
      const g = s.diagnostic.granted;
      if (g?.width && g?.height) {
        const mode = `${g.width}x${g.height}`;
        modes.set(mode, (modes.get(mode) ?? 0) + 1);
      }
    }
    const commonMode = [...modes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    rows.push({
      group,
      sessions: new Set(streams.map((s) => s.diagnostic.session)).size,
      streams: streams.length,
      captures: captures.length,
      ok: captures.filter((c) => c.diagnostic.capture?.outcome === 'ok').length,
      notReady: captures.filter((c) => c.diagnostic.capture?.outcome === 'not_ready').length,
      failed: captures.filter((c) => c.diagnostic.capture?.outcome === 'failed').length,
      withBrokenFrames: captures.filter((c) => (c.diagnostic.capture?.brokenRetries ?? 0) > 0).length,
      dark: captures.filter(
        (c) =>
          c.diagnostic.capture?.outcome === 'ok' &&
          c.diagnostic.capture.lumaMean !== undefined &&
          c.diagnostic.capture.lumaMean < DARK_MEAN_THRESHOLD
      ).length,
      noFrameEvent: streams.filter((s) => s.diagnostic.timing?.firstFrameMs === undefined).length,
      medianFirstFrameMs: median(streams.flatMap((s) => (s.diagnostic.timing?.firstFrameMs !== undefined ? [s.diagnostic.timing.firstFrameMs] : []))),
      medianShutterUnlockMs: median(streams.flatMap((s) => (s.diagnostic.timing?.shutterUnlockMs !== undefined ? [s.diagnostic.timing.shutterUnlockMs] : []))),
      medianShutterDelayMs: median(captures.flatMap((c) => (c.diagnostic.timing?.shutterDelayMs !== undefined ? [c.diagnostic.timing.shutterDelayMs] : []))),
      commonMode,
    });
  }

  return rows.sort((a, b) => b.captures + b.sessions - (a.captures + a.sessions));
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : '-';
}

function cell(value: number | undefined): string {
  return value === undefined ? '-' : String(value);
}

export function formatReport(rows: ReportRow[]): string {
  const header = ['group', 'sessions', 'streams', 'captures', 'ok', 'not ready', 'failed', 'broken-frame rate', 'dark photos', 'no frame event', 'first frame ms', 'unlock ms', 'tap delay ms', 'mode'];
  const lines = rows.map((r) => [
    r.group,
    String(r.sessions),
    String(r.streams),
    String(r.captures),
    String(r.ok),
    String(r.notReady),
    String(r.failed),
    pct(r.withBrokenFrames, r.captures),
    pct(r.dark, r.ok),
    String(r.noFrameEvent),
    cell(r.medianFirstFrameMs),
    cell(r.medianShutterUnlockMs),
    cell(r.medianShutterDelayMs),
    r.commonMode ?? '-',
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const render = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return [render(header), render(widths.map((w) => '-'.repeat(w))), ...lines.map(render)].join('\n');
}
