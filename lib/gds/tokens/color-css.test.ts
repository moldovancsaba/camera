import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cssColour } from './color-css';

test('#RRGGBBAA keeps its alpha, #RRGGBB is opaque, #RGB is expanded', () => {
  assert.equal(cssColour('#ffffff80'), 'rgba(255, 255, 255, 0.5019607843137255)');
  assert.equal(cssColour('#3B82F6'), 'rgba(59, 130, 246, 1)');
  assert.equal(cssColour('#3B82F6FF'), 'rgba(59, 130, 246, 1)');
  assert.equal(cssColour('#f00'), 'rgba(255, 0, 0, 1)');
});
