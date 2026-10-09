import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ttlOnce } from './ttl-once';

test('callers within the time share one load, and the value is loaded again after it', async () => {
  let clock = 1000;
  let loads = 0;
  const get = ttlOnce(async () => ++loads, 60_000, () => clock);
  assert.deepEqual(await Promise.all([get(), get(), get()]), [1, 1, 1]);
  clock += 59_000;
  assert.equal(await get(), 1);
  clock += 2000;
  assert.equal(await get(), 2);
  assert.equal(loads, 2);
});

test('clear makes the next call load again', async () => {
  let loads = 0;
  const get = ttlOnce(async () => ++loads, 60_000, () => 0);
  await get();
  get.clear();
  assert.equal(await get(), 2);
});

test('a failed load is not kept', async () => {
  let loads = 0;
  const get = ttlOnce(async () => {
    loads += 1;
    if (loads === 1) throw new Error('db down');
    return 'ok';
  }, 60_000, () => 0);
  await assert.rejects(get(), /db down/);
  assert.equal(await get(), 'ok');
  assert.equal(loads, 2);
});
