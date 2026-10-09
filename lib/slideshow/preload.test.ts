import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreloader } from './preload';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A loader whose pictures take `delays[url]` ms (never when Infinity), failing for the urls in `bad`. */
function fakeLoader(delays: Record<string, number> = {}, bad: string[] = []) {
  const calls: string[] = [];
  let active = 0;
  let peak = 0;
  const load = async (url: string) => {
    calls.push(url);
    active += 1;
    peak = Math.max(peak, active);
    try {
      const d = delays[url] ?? 5;
      if (d === Infinity) await new Promise(() => undefined);
      else await sleep(d);
      if (bad.includes(url)) throw new Error(`cannot load ${url}`);
      return `img:${url}`;
    } finally {
      active -= 1;
    }
  };
  return { load, calls, peak: () => peak };
}

test('a picture is loaded once and then found ready', async () => {
  const f = fakeLoader();
  const p = createPreloader({ load: f.load });
  const first = await p.preload('a');
  assert.deepEqual([first.ok, first.ok && first.value], [true, 'img:a']);
  const again = await p.preload('a');
  assert.ok(again.ok && again.ms === 0);
  assert.deepEqual(f.calls, ['a']);
  assert.equal(p.get('a'), 'img:a');
});

test('the same picture asked twice while loading is one load', async () => {
  const f = fakeLoader({ a: 30 });
  const p = createPreloader({ load: f.load });
  const [x, y] = await Promise.all([p.preload('a'), p.preload('a')]);
  assert.ok(x.ok && y.ok);
  assert.deepEqual(f.calls, ['a']);
});

test('at most `concurrency` loads run at a time, in the order they were asked for', async () => {
  const f = fakeLoader({ a: 20, b: 20, c: 20, d: 20, e: 20 });
  const p = createPreloader({ load: f.load, concurrency: 2 });
  await Promise.all(['a', 'b', 'c', 'd', 'e'].map((u) => p.preload(u)));
  assert.equal(f.peak(), 2);
  assert.deepEqual(f.calls, ['a', 'b', 'c', 'd', 'e']);
});

test('an urgent load skips the line', async () => {
  const f = fakeLoader({ a: 40, b: 40, c: 5 });
  const p = createPreloader({ load: f.load, concurrency: 1 });
  const slow = [p.preload('a'), p.preload('b')];
  await sleep(5);
  const urgent = await p.preload('c', { urgent: true });
  assert.ok(urgent.ok);
  assert.deepEqual(f.calls.slice(0, 2), ['a', 'c']);
  await Promise.all(slow);
});

test('a picture that is too slow is reported as a timeout, keeps loading, and is ready when it arrives', async () => {
  const f = fakeLoader({ slow: 120 });
  const p = createPreloader({ load: f.load, timeoutMs: 30 });
  const result = await p.preload('slow');
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'timeout']);
  assert.equal(p.has('slow'), false);
  await sleep(150);
  assert.equal(p.has('slow'), true, 'it arrived late and was kept');
  assert.ok((await p.preload('slow')).ok);
});

test('a load that hangs forever gives its place back, so the other pictures still load', async () => {
  const f = fakeLoader({ dead: Infinity });
  const p = createPreloader({ load: f.load, concurrency: 1, timeoutMs: 30 });
  const dead = p.preload('dead');
  const next = await p.preload('b');
  assert.ok(next.ok, 'the second picture loaded although the first never answers');
  assert.equal((await dead).ok, false);
});

test('a failed picture is not tried again until the time is up', async () => {
  const f = fakeLoader({}, ['bad']);
  let clock = 1000;
  const p = createPreloader({ load: f.load, now: () => clock, failTtlMs: 60_000 });
  const first = await p.preload('bad');
  assert.deepEqual([first.ok, !first.ok && first.reason], [false, 'error']);
  assert.equal((await p.preload('bad')).ok, false);
  assert.deepEqual(f.calls, ['bad'], 'not tried again at once');
  clock += 61_000;
  await p.preload('bad');
  assert.deepEqual(f.calls, ['bad', 'bad'], 'tried again after the time');
});

test('prune forgets what is not kept', async () => {
  const f = fakeLoader();
  const p = createPreloader({ load: f.load });
  await Promise.all(['a', 'b', 'c'].map((u) => p.preload(u)));
  p.prune(new Set(['b']));
  assert.deepEqual([p.has('a'), p.has('b'), p.has('c'), p.size()], [false, true, false, 1]);
});
