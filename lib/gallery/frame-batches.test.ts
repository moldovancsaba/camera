import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_CHUNK, describeFailure, frameInBatches, frameOutcome } from './frame-batches';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const answerAll = async (batch: string[]) => ({ framed: batch.map((id) => ({ id, imageUrl: `https://img.example.test/${id}.jpg` })), skipped: [] });

test('twenty photos go in batches of five, in order, and the progress is reported after each batch', async () => {
  const sent: string[][] = [];
  const progress: Array<[number, number]> = [];
  const result = await frameInBatches(ids(20), async (batch) => { sent.push(batch); return answerAll(batch); }, (done, total) => progress.push([done, total]));
  assert.equal(FRAME_CHUNK, 5);
  assert.deepEqual(sent.map((b) => b.length), [5, 5, 5, 5]);
  assert.deepEqual(sent.flat(), ids(20));
  assert.deepEqual(progress, [[5, 20], [10, 20], [15, 20], [20, 20]]);
  assert.equal(result.framed.length, 20);
  assert.equal(result.failure, null);
  assert.deepEqual(frameOutcome(result), { message: 'Framed 20 photos.', error: null });
});

test('a batch that fails stops the run, keeps what was done, and says so (the run that looked like a dead button)', async () => {
  let calls = 0;
  const result = await frameInBatches(ids(12), async (batch) => {
    calls += 1;
    if (calls === 2) throw new Error('The server answered 504 (it took too long)');
    return answerAll(batch);
  });
  assert.equal(calls, 2, 'nothing is sent after the failure');
  assert.equal(result.framed.length, 5);
  assert.equal(result.failure, 'The server answered 504 (it took too long)');
  const outcome = frameOutcome(result);
  assert.equal(outcome.message, 'Framed 5 photos.');
  assert.match(outcome.error ?? '', /504.*press the button again for the rest/);
});

test('a first batch that fails changes nothing and says that, with no summary of work that was not done', async () => {
  const result = await frameInBatches(ids(3), async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(result.framed.length, 0);
  assert.deepEqual(frameOutcome(result), { message: null, error: 'The request did not reach the server. Nothing was changed.' });
});

test('photos the server left as they were are counted with their reasons, once each', async () => {
  const result = await frameInBatches(['a', 'b', 'c'], async () => ({ framed: [{ id: 'a', imageUrl: 'https://img.example.test/a.jpg' }], skipped: [{ id: 'b', reason: 'already has a frame' }, { id: 'c', reason: 'already has a frame' }] }));
  assert.equal(frameOutcome(result).message, 'Framed 1 photo; 2 left as they were (already has a frame).');
});

test('no photos send nothing, and a failure always has words', async () => {
  let called = false;
  const result = await frameInBatches([], async (batch) => { called = true; return answerAll(batch); });
  assert.equal(called, false);
  assert.deepEqual(frameOutcome(result), { message: 'Framed 0 photos.', error: null });
  assert.equal(describeFailure(new Error('  ')), 'The frame could not be added.');
  assert.equal(describeFailure('boom'), 'The frame could not be added.');
  assert.equal(describeFailure(new Error('The event has no frame yet.')), 'The event has no frame yet.');
});
