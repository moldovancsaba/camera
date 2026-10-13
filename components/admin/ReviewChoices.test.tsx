import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MantineProvider } from '@mantine/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveVocabulary, STANDARD_VOCABULARY } from '@/lib/photo-vetting/vocabulary';
import { RejectActionNotice, RejectReasonPicker } from './ReviewChoices';

const render = (vocabulary = resolveVocabulary()) =>
  renderToStaticMarkup(
    <MantineProvider>
      <RejectReasonPicker vocabulary={vocabulary} reasons={[]} onToggleReason={() => undefined} note="" onNote={() => undefined} />
    </MantineProvider>
  );

test('rejection asks why it should be rejected and makes the selected reasons an explicit prerequisite', () => {
  const html = render();
  assert.match(html, /Select at least one rejection reason\./);
  assert.match(html, /Nudity or sexual content/);
  assert.doesNotMatch(html, /Why is it rejected\?/);
});

test('when there are no offered reasons, the reviewer is told the rejection cannot be completed', () => {
  const vocabulary = resolveVocabulary({ event: { options: STANDARD_VOCABULARY.options.filter((option) => option.group === 'reject_reason').map(({ group, key }) => ({ group, key, hidden: true })) } });
  assert.match(render(vocabulary), /No reasons are offered for this event, so a photo cannot be rejected here/);
});

test('the rejection step says it is still waiting until the final reject action, and includes any marking requirement', () => {
  const html = renderToStaticMarkup(
    <MantineProvider>
      <RejectActionNotice markingMessage="Draw a rectangle around each person, or choose Nobody in this photo." />
    </MantineProvider>
  );
  assert.match(html, /Reject this photo/);
  assert.match(html, /This photo is still waiting/);
  assert.match(html, /press “Reject photo” to complete the rejection/);
  assert.match(html, /choose Nobody in this photo/);
});
