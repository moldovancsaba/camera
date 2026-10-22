import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imgbbDeletionIsComplete } from './upload';

describe('ImgBB deletion idempotency', () => {
  it('accepts a missing mirror only when the delete link and public image are both gone', () => {
    assert.equal(imgbbDeletionIsComplete(404, 404), true);
    assert.equal(imgbbDeletionIsComplete(410, 410), true);
    assert.equal(imgbbDeletionIsComplete(404, 200), false);
    assert.equal(imgbbDeletionIsComplete(410, 403), false);
    assert.equal(imgbbDeletionIsComplete(500, 404), false);
    assert.equal(imgbbDeletionIsComplete(undefined, 404), false);
  });
});
