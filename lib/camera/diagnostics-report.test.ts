import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CameraDiagnostic } from './diagnostics';
import { extractRecords, formatReport, parseUserAgent, summarize, type DiagnosticRecord } from './diagnostics-report';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const PIXEL_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0';
const REDUCED_CHROME = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

test('user agents are reduced to browser, OS and device', () => {
  assert.deepEqual(parseUserAgent(IPHONE_SAFARI), { browser: 'Safari 17', os: 'iOS 17', device: 'iPhone' });
  assert.deepEqual(parseUserAgent(IPHONE_CHROME), { browser: 'Chrome iOS 126', os: 'iOS 17', device: 'iPhone' });
  assert.deepEqual(parseUserAgent(PIXEL_CHROME), { browser: 'Chrome 126', os: 'Android 14', device: 'Pixel 8' });
  assert.deepEqual(parseUserAgent(SAMSUNG), { browser: 'Samsung Internet 25', os: 'Android 14', device: 'SM-S918B' });
  assert.deepEqual(parseUserAgent(INSTAGRAM), { browser: 'Instagram in-app', os: 'iOS 17', device: 'iPhone' });
  assert.deepEqual(parseUserAgent(MAC_CHROME), { browser: 'Chrome 126', os: 'macOS', device: 'desktop' });
  assert.deepEqual(parseUserAgent(FIREFOX_ANDROID), { browser: 'Firefox 127', os: 'Android 14', device: 'Android (model hidden)' });
  assert.equal(parseUserAgent(REDUCED_CHROME).device, 'Android (model hidden)');
  assert.deepEqual(parseUserAgent(undefined), { browser: 'Other', os: 'Other', device: 'desktop' });
});

function stream(session: string, ua: string, timing: CameraDiagnostic['timing'], granted?: CameraDiagnostic['granted']): DiagnosticRecord {
  return { userAgent: ua, diagnostic: { v: 1, kind: 'stream_started', session, timing, granted } };
}

function capture(session: string, ua: string, c: NonNullable<CameraDiagnostic['capture']>, delay?: number): DiagnosticRecord {
  return { userAgent: ua, diagnostic: { v: 1, kind: 'capture', session, timing: delay === undefined ? undefined : { shutterDelayMs: delay }, capture: c } };
}

test('the summary counts outcomes, broken frames, dark photos and timings per browser', () => {
  const records: DiagnosticRecord[] = [
    stream('s1-aaaaaaaa', PIXEL_CHROME, { firstFrameMs: 200, shutterUnlockMs: 800 }, { width: 1080, height: 1920 }),
    stream('s2-bbbbbbbb', PIXEL_CHROME, { firstFrameMs: 400, shutterUnlockMs: 1000 }, { width: 1080, height: 1920 }),
    stream('s3-cccccccc', PIXEL_CHROME, { shutterUnlockMs: 4000 }),
    capture('s1-aaaaaaaa', PIXEL_CHROME, { outcome: 'ok', brokenRetries: 2, lumaMean: 120 }, 1500),
    capture('s2-bbbbbbbb', PIXEL_CHROME, { outcome: 'ok', brokenRetries: 0, lumaMean: 9 }, 2500),
    capture('s3-cccccccc', PIXEL_CHROME, { outcome: 'not_ready', brokenRetries: 6 }, 500),
    stream('s4-dddddddd', IPHONE_SAFARI, { firstFrameMs: 150, shutterUnlockMs: 750 }, { width: 1920, height: 1080 }),
    capture('s4-dddddddd', IPHONE_SAFARI, { outcome: 'ok', lumaMean: 140 }, 1000),
  ];
  const rows = summarize(records, 'browser');
  const pixel = rows.find((r) => r.group === 'Chrome 126 / Android 14');
  const iphone = rows.find((r) => r.group === 'Safari 17 / iOS 17');
  assert.ok(pixel && iphone);
  assert.equal(pixel.sessions, 3);
  assert.equal(pixel.streams, 3);
  assert.equal(pixel.captures, 3);
  assert.equal(pixel.ok, 2);
  assert.equal(pixel.notReady, 1);
  assert.equal(pixel.withBrokenFrames, 2);
  assert.equal(pixel.dark, 1);
  assert.equal(pixel.noFrameEvent, 1);
  assert.equal(pixel.medianFirstFrameMs, 300);
  assert.equal(pixel.medianShutterDelayMs, 1500);
  assert.equal(pixel.commonMode, '1080x1920');
  assert.equal(iphone.withBrokenFrames, 0);
  assert.equal(rows[0].group, 'Chrome 126 / Android 14', 'busiest group first');
});

test('grouping by device and by test label', () => {
  const records: DiagnosticRecord[] = [
    { userAgent: SAMSUNG, diagnostic: { v: 1, kind: 'capture', session: 's5-eeeeeeee', testRun: 'galaxy-s23', capture: { outcome: 'ok' } } },
    { userAgent: SAMSUNG, diagnostic: { v: 1, kind: 'capture', session: 's6-ffffffff', capture: { outcome: 'ok' } } },
  ];
  assert.deepEqual(summarize(records, 'device').map((r) => r.group), ['SM-S918B']);
  assert.deepEqual(summarize(records, 'testRun').map((r) => r.group).sort(), ['(no test label)', 'galaxy-s23']);
});

test('records are extracted from plain and wrapped log lines and other lines are ignored', () => {
  const inner = { level: 'info', event: 'camera.capture_diagnostic', message: 'capture', timestamp: '2026-10-06T10:00:00.000Z', context: { diagnostic: { v: 1, kind: 'capture', session: 's7-gggggggg', capture: { outcome: 'ok' } }, userAgent: PIXEL_CHROME } };
  const lines = [
    JSON.stringify(inner),
    `2026-10-06T10:00:01Z [info] ${JSON.stringify(inner)}`,
    JSON.stringify({ message: JSON.stringify(inner), source: 'lambda' }),
    JSON.stringify({ level: 'error', event: 'api.error', message: 'unrelated' }),
    'not json at all camera.capture_diagnostic',
    '',
  ];
  const records = extractRecords(lines);
  assert.equal(records.length, 3);
  assert.equal(records[0].userAgent, PIXEL_CHROME);
  assert.equal(records[0].timestamp, '2026-10-06T10:00:00.000Z');
});

test('the formatted report has a header row and one line per group', () => {
  const rows = summarize([capture('s8-hhhhhhhh', PIXEL_CHROME, { outcome: 'ok', brokenRetries: 1, lumaMean: 100 })], 'browser');
  const text = formatReport(rows);
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('group'));
  assert.ok(lines[2].includes('Chrome 126 / Android 14'));
  assert.ok(lines[2].includes('100%'), 'one capture with a broken frame is a 100% broken-frame rate');
});
