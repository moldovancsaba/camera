import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route';

const SESSION = '3f2b8c1e-7a54-4d8e-9c21-0b6a5e4d3c2f';
let ipCounter = 0;

function request(body: string, headers: Record<string, string> = {}, ip?: string): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/observability/capture-diagnostic', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip ?? `198.51.100.${ipCounter}`, ...headers },
  });
}

async function captureLogs(run: () => Promise<void>): Promise<Array<Record<string, unknown>>> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: unknown) => {
    lines.push(String(line));
  };
  try {
    await run();
  } finally {
    console.log = original;
  }
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

const validBody = JSON.stringify({
  v: 1,
  kind: 'capture',
  session: SESSION,
  capture: { outcome: 'ok', attempts: 1, lumaMean: 140, lumaStdDev: 38 },
  deviceId: 'must-not-appear',
});

test('a valid record answers 204 and is logged once as a structured line without extra fields', async () => {
  let status = 0;
  const logs = await captureLogs(async () => {
    const response = await POST(request(validBody, { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari' }));
    status = response.status;
  });
  assert.equal(status, 204);
  const records = logs.filter((l) => l.event === 'camera.capture_diagnostic');
  assert.equal(records.length, 1);
  const context = records[0].context as { diagnostic: Record<string, unknown>; userAgent?: string };
  assert.equal((context.diagnostic.capture as { outcome: string }).outcome, 'ok');
  assert.equal(JSON.stringify(records[0]).includes('must-not-appear'), false);
  assert.ok(context.userAgent?.includes('iPhone'));
});

test('the user agent is clamped to 200 characters', async () => {
  const logs = await captureLogs(async () => {
    await POST(request(validBody, { 'user-agent': 'x'.repeat(500) }));
  });
  const context = logs.find((l) => l.event === 'camera.capture_diagnostic')?.context as { userAgent?: string };
  assert.equal(context.userAgent?.length, 200);
});

test('invalid JSON, wrong version and incomplete records answer 400 and are not logged', async () => {
  const logs = await captureLogs(async () => {
    assert.equal((await POST(request('{not json'))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ v: 9, kind: 'capture', session: SESSION })))).status, 400);
    assert.equal((await POST(request(JSON.stringify({ v: 1, kind: 'capture', session: SESSION })))).status, 400);
    assert.equal((await POST(request(''))).status, 400);
  });
  assert.equal(logs.filter((l) => l.event === 'camera.capture_diagnostic').length, 0);
});

test('an oversized body answers 413 and is not logged', async () => {
  const logs = await captureLogs(async () => {
    const big = JSON.stringify({ v: 1, kind: 'stream_started', session: SESSION, pad: 'x'.repeat(5000) });
    assert.equal((await POST(request(big))).status, 413);
  });
  assert.equal(logs.filter((l) => l.event === 'camera.capture_diagnostic').length, 0);
});

test('a flood from one address is cut off with 429', async () => {
  const ip = '203.0.113.99';
  let limited = 0;
  await captureLogs(async () => {
    for (let i = 0; i < 320; i += 1) {
      const response = await POST(request(validBody, {}, ip));
      if (response.status === 429) limited += 1;
    }
  });
  assert.ok(limited > 0, 'expected at least one 429 after the 300 per minute cap');
});
