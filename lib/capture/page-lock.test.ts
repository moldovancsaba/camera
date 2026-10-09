import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CustomPageType } from '@/lib/db/schemas';
import { phasePageLock } from './page-lock';

test('every journey page is locked against zoom except the consent page, which is for reading', () => {
  const locked = Object.values(CustomPageType).filter((type) => phasePageLock(type) === 'zoom');
  assert.deepEqual(
    locked.sort(),
    [CustomPageType.WHO_ARE_YOU, CustomPageType.CTA, CustomPageType.TAKE_PHOTO, CustomPageType.RESTART, CustomPageType.WELCOME].sort()
  );
  assert.equal(phasePageLock(CustomPageType.ACCEPT), 'none');
  assert.equal(phasePageLock('something-new'), 'zoom', 'a page type added later is locked until someone decides it is for reading');
});
