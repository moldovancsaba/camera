import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizePeople } from '@/lib/photo-vetting/people';
import PeopleSummaryCard from './PeopleSummaryCard';

const person = (extra: Record<string, unknown> = {}) => ({ id: 'a', box: { x: 10, y: 20, w: 30, h: 40 }, gender: 'female', age: 'adult', ...extra });

test('nothing is shown until a photo was looked at', () => {
  assert.equal(renderToStaticMarkup(<PeopleSummaryCard summary={summarizePeople([])} />), '');
  assert.equal(renderToStaticMarkup(<PeopleSummaryCard summary={summarizePeople([{}])} />), '');
});

test('the card says how many people in how many photos, and the counts with the emoji of the buttons', () => {
  const html = renderToStaticMarkup(
    <PeopleSummaryCard summary={summarizePeople([{ people: [person({ emotion: 'happy', merch: ['cap', 'flag'] }), person({ gender: 'male', age: 'old', emotion: 'sad' })] }, { people: [] }])} />,
  );
  assert.match(html, /2 people in 2 photos/);
  assert.match(html, /1 with somebody in it/);
  assert.match(html, /👩 Female adult: 1 \(50 %\)/);
  assert.match(html, /👴 Male old: 1 \(50 %\)/);
  assert.match(html, /😃 Happy: 1/);
  assert.match(html, /With any: 1 \(50 %\)/);
  assert.match(html, /🧢 Cap: 1/);
  assert.match(html, /🇭🇺 Flag: 1/);
});
