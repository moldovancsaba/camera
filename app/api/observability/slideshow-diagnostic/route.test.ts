import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route';

const SESSION = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
let ipCounter = 0;

function request(body: string, headers: Record<string, string> = {}, ip?: string): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/observability/slideshow-diagnostic', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `198.51.100.${ipCounter}`, ...headers },
  });
}

async function captureLogs(run: () => Promise<void>): Promise<Array<Record<string, unknown>>> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (line: unknown) => void lines.push(String(line));
  console.warn = (line: unknown) => void lines.push(String(line));
  try {
    await run();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

const body = (events: unknown[]) => JSON.stringify({ v: 1, slideshowId: 'show_1', variant: 'fullscreen', session: SESSION, uptimeS: 60, events, deviceId: 'must-not-appear' });
const quiet = body([{ t: 1, type: 'slide_shown', id: 'abc123', dup: false, q: 11 }]);
const stalled = body([{ t: 9, type: 'stall', sinceMs: 15000, q: 11, busy: true }]);

test('a quiet batch answers 204 and is logged once as info, without extra fields', async () => {
  let status = 0;
  const logs = await captureLogs(async () => {
    status = (await POST(request(quiet, { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' }))).status;
  });
  assert.equal(status, 204);
  const records = logs.filter((l) => l.event === 'camera.slideshow_diagnostic');
  assert.equal(records.length, 1);
  assert.equal(records[0].level, 'info');
  assert.equal(JSON.stringify(records[0]).includes('must-not-appear'), false);
  assert.ok((records[0].context as { userAgent?: string }).userAgent?.includes('Chrome'));
});

test('a batch with a stall is logged as a warning', async () => {
  const logs = await captureLogs(async () => {
    assert.equal((await POST(request(stalled))).status, 204);
  });
  const record = logs.find((l) => l.event === 'camera.slideshow_diagnostic');
  assert.equal(record?.level, 'warn');
});

test('invalid JSON, an unknown version and an empty batch answer 400 and are not logged', async () => {
  const logs = await captureLogs(async () => {
    assert.equal((await POST(request('{not json'))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ v: 9 })))).status, 400);
    assert.equal((await POST(request(body([])))).status, 400);
    assert.equal((await POST(request(''))).status, 400);
  });
  assert.equal(logs.filter((l) => l.event === 'camera.slideshow_diagnostic').length, 0);
});

test('an oversized body answers 413 and is not logged', async () => {
  const logs = await captureLogs(async () => {
    assert.equal((await POST(request(JSON.stringify({ pad: 'x'.repeat(17000) })))).status, 413);
  });
  assert.equal(logs.filter((l) => l.event === 'camera.slideshow_diagnostic').length, 0);
});

test('a flood from one address is cut off with 429', async () => {
  const ip = '203.0.113.77';
  let limited = 0;
  await captureLogs(async () => {
    for (let i = 0; i < 320; i += 1) {
      if ((await POST(request(quiet, {}, ip))).status === 429) limited += 1;
    }
  });
  assert.ok(limited > 0, 'expected at least one 429 after the 300 per minute cap');
});
