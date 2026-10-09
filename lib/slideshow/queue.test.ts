import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expandPlaylistToLength, type Slide as PlaylistSlide } from './playlist';
import {
  EXCLUDE_CAP,
  advanceLoop,
  appendFresh,
  appendFromSeed,
  excludeIds,
  freshSlides,
  mergeSeed,
  slideKey,
  type QueueSlide,
} from './queue';

const slide = (id: string): QueueSlide => ({ submissions: [{ _id: id }] });
const slides = (...ids: string[]) => ids.map(slide);
const keys = (q: QueueSlide[]) => q.map(slideKey);

test('excludeIds lists every submission id of the queue once and stops at the cap', () => {
  assert.deepEqual(excludeIds([slide('a'), { submissions: [{ _id: 'b' }, { _id: 'a' }] }, slide('c')]), ['a', 'b', 'c']);
  const long = Array.from({ length: 150 }, (_, i) => slide(`s${i}`));
  assert.equal(excludeIds(long).length, EXCLUDE_CAP);
});

test('excludeIds adds the photos that would not load after the queue\'s own, and the cap cuts those first', () => {
  assert.deepEqual(excludeIds(slides('a', 'b'), ['x', 'a', 'y']), ['a', 'b', 'x', 'y']);
  const queue = Array.from({ length: 98 }, (_, i) => slide(`s${i}`));
  const ids = excludeIds(queue, ['bad1', 'bad2', 'bad3', 'bad4']);
  assert.equal(ids.length, EXCLUDE_CAP);
  assert.ok(ids.includes('s97') && ids.includes('bad2') && !ids.includes('bad3'));
});

test('freshSlides drops what the queue holds and what the answer says twice', () => {
  assert.deepEqual(keys(freshSlides(slides('a', 'b'), slides('b', 'c', 'c', 'd'))), ['c', 'd']);
});

test('appendFresh adds only new slides, up to the target, and returns the same array when nothing is added', () => {
  const queue = slides('a', 'b');
  assert.deepEqual(keys(appendFresh(queue, slides('b', 'c', 'd', 'e'), 4)), ['a', 'b', 'c', 'd']);
  assert.equal(appendFresh(queue, slides('a', 'b'), 4), queue);
  const full = slides('a', 'b', 'c');
  assert.equal(appendFresh(full, slides('d'), 3), full);
});

test('appendFromSeed continues the loop after the last queued slide and prefers slides the queue does not hold', () => {
  const seed = slides('a', 'b', 'c', 'd', 'e');
  assert.deepEqual(keys(appendFromSeed(slides('b', 'c'), seed, 4)), ['b', 'c', 'd', 'e']);
  // wraps around the end of the seed
  assert.deepEqual(keys(appendFromSeed(slides('d', 'e'), seed, 4)), ['d', 'e', 'a', 'b']);
  // a queue that holds everything repeats in loop order
  assert.deepEqual(keys(appendFromSeed(slides('a', 'b', 'c'), slides('a', 'b', 'c'), 6)), ['a', 'b', 'c', 'a', 'b', 'c']);
  // nothing to continue from
  const q = slides('a');
  assert.equal(appendFromSeed(q, null, 3), q);
  assert.equal(appendFromSeed(q, [], 3), q);
});

test('advanceLoop drops the current slide, moves on from the last slide, and restores an empty queue from the seed', () => {
  assert.deepEqual(keys(advanceLoop(slides('a', 'b', 'c'), null, 3)), ['b', 'c']);
  // one slide left and other slides known: show those, not the same picture again
  assert.deepEqual(keys(advanceLoop(slides('a'), slides('a', 'b', 'c'), 3)), ['b']);
  // one slide left and nothing else known: the same slide again, as a new array so the screen fades
  const only = slides('a');
  const again = advanceLoop(only, only, 3);
  assert.deepEqual(keys(again), ['a']);
  assert.notEqual(again, only);
  assert.deepEqual(keys(advanceLoop(only, null, 3)), ['a']);
  // empty
  assert.deepEqual(keys(advanceLoop([], slides('a', 'b'), 4)), ['a', 'b', 'a', 'b']);
  const empty: QueueSlide[] = [];
  assert.equal(advanceLoop(empty, null, 4), empty);
});

test('mergeSeed keeps every slide once, in the order it arrived', () => {
  const seed = mergeSeed(null, slides('a', 'b'));
  assert.deepEqual(keys(mergeSeed(seed, slides('b', 'c', 'a', 'd'))), ['a', 'b', 'c', 'd']);
});

// --- A model of the player against the playlist route (fixed order: playCount ascending, then oldest first) ---

interface Photo { id: string; createdAt: number; playCount: number }
type Answer = (limit: number, exclude: string[]) => QueueSlide[];

/** The route: eligible pool minus `exclude` (the whole pool when that leaves nothing), fairness order, `limit` slides, cycled to `limit` in loop mode. */
function server(pool: Photo[]): Answer {
  return (limit, exclude) => {
    const out = new Set(exclude);
    let eligible = pool.filter((p) => !out.has(p.id));
    if (eligible.length === 0) eligible = pool;
    const sorted = [...eligible].sort((a, b) => a.playCount - b.playCount || a.createdAt - b.createdAt);
    const base = sorted.slice(0, limit).map((p) => slide(p.id) as unknown as PlaylistSlide);
    return expandPlaylistToLength(base, limit) as unknown as QueueSlide[];
  };
}

/** The player: the same calls `maintainLoopBuffer` makes (exclude the queue, keep only fresh slides, fall back on the seed). */
function play({ pool, bufferSize, ticks, onTick, answers }: {
  pool: Photo[];
  bufferSize: number;
  ticks: number;
  onTick?: (tick: number, pool: Photo[]) => void;
  answers?: (tick: number, real: Answer) => Answer;
}): string[] {
  const target = bufferSize + 1;
  const real = server(pool);
  let queue = real(target, []);
  let seed = mergeSeed<QueueSlide>(null, queue);
  const shown: string[] = [];
  for (let tick = 0; tick < ticks; tick++) {
    onTick?.(tick, pool);
    const head = queue[0].submissions[0]._id;
    shown.push(head);
    pool.find((p) => p.id === head)!.playCount++;
    queue = advanceLoop(queue, seed, target);
    const ask = answers ? answers(tick, real) : real;
    for (let round = 0; round < 12 && queue.length < target; round++) {
      const answer = ask(Math.min(target - queue.length, 25), excludeIds(queue));
      const fresh = freshSlides(queue, answer);
      seed = mergeSeed(seed, fresh);
      for (const sl of fresh) queue = appendFresh(queue, [sl], target);
      if (fresh.length === 0) {
        queue = appendFromSeed(queue, seed, target);
        break;
      }
    }
  }
  return shown;
}

const longestRun = (shown: string[]) => {
  let best = 1;
  let run = 1;
  for (let i = 1; i < shown.length; i++) {
    run = shown[i] === shown[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
};

const newPool = (count: number): Photo[] => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, createdAt: i, playCount: 0 }));

for (const bufferSize of [3, 10]) {
  test(`fixed order, buffer ${bufferSize}: a new photo every 4 slides never makes the screen stand still (was a run of ${bufferSize + 1})`, () => {
    let next = 12;
    const shown = play({
      pool: newPool(12),
      bufferSize,
      ticks: 300,
      onTick: (tick, pool) => {
        if (tick > 0 && tick % 4 === 0) pool.push({ id: `p${next}`, createdAt: next++, playCount: 0 });
      },
    });
    assert.equal(longestRun(shown), 1);
  });
}

test('fixed order: a new photo reaches the screen within one queue length, and every photo is played about equally often', () => {
  const bufferSize = 5;
  const added = new Map<string, number>();
  const pool = newPool(20);
  const shown = play({
    pool,
    bufferSize,
    ticks: 400,
    onTick: (tick, p) => {
      if (tick === 100) {
        p.push({ id: 'new', createdAt: 1000, playCount: 0 });
        added.set('new', tick);
      }
    },
  });
  const firstShown = shown.indexOf('new');
  assert.ok(firstShown >= 100, 'not shown before it exists');
  assert.ok(firstShown - 100 <= bufferSize + 2, `shown ${firstShown - 100} slides after it was added`);
  const counts = pool.filter((p) => p.id !== 'new').map((p) => p.playCount);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `play counts ${Math.min(...counts)}..${Math.max(...counts)}`);
});

test('a pool smaller than the queue repeats in loop order and never shows the same photo twice in a row', () => {
  const shown = play({ pool: newPool(4), bufferSize: 10, ticks: 60 });
  assert.equal(longestRun(shown), 1);
  assert.deepEqual(shown.slice(0, 8), ['p0', 'p1', 'p2', 'p3', 'p0', 'p1', 'p2', 'p3']);
});

test('a single photo repeats because it is the only one', () => {
  assert.equal(longestRun(play({ pool: newPool(1), bufferSize: 3, ticks: 10 })), 10);
});

test('the server not answering for a while keeps the screen moving through what the player already knows', () => {
  const shown = play({
    pool: newPool(14),
    bufferSize: 10,
    ticks: 120,
    answers: (tick, real) => (tick >= 20 && tick < 80 ? () => [] : real),
  });
  assert.equal(longestRun(shown), 1);
  assert.ok(new Set(shown.slice(20, 80)).size >= 14, 'it went round all 14 photos while offline');
});
