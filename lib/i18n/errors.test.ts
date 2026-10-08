import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorText } from './errors';

test('in English the server\'s own text is shown, whatever it is', () => {
  assert.equal(errorText('en', 'Image data is required'), 'Image data is required');
  assert.equal(errorText('en', 'Something nobody planned'), 'Something nobody planned');
  assert.equal(errorText('en', 'Failed to fetch'), 'Failed to fetch');
});

test('in Hungarian a known text is translated, a network failure gets its own text, an unknown text becomes the general one', () => {
  assert.equal(errorText('hu', 'Image data is required'), 'A kép hiányzik.');
  assert.equal(errorText('hu', 'Frame not found'), 'A keret nem található.');
  assert.equal(errorText('hu', 'Too many requests, please try again later'), 'Túl sok kérés, próbáld újra később.');
  assert.match(errorText('hu', 'Failed to fetch'), /szervert/);
  assert.match(errorText('hu', 'Load failed'), /szervert/);
  assert.equal(errorText('hu', 'Something nobody planned'), 'Váratlan hiba történt');
});
